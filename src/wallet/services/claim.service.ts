import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Game } from 'src/game/entities/game.entity';
import { DataSource, In, Not, Repository } from 'typeorm';
import { UserWallet } from '../entities/user-wallet.entity';
import { ClaimDetail } from '../entities/claim-detail.entity';
import { BetOrder } from 'src/game/entities/bet-order.entity';
import { WalletTx } from '../entities/wallet-tx.entity';
import { DrawResult } from 'src/game/entities/draw-result.entity';
import { ethers } from 'ethers';
import { Core__factory } from 'src/contract';
import { ICore } from 'src/contract/Core';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { GameUsdTx } from '../entities/game-usd-tx.entity';
import { UserService } from 'src/user/user.service';
import { MPC } from 'src/shared/mpc';
import { PointTxType, WalletTxType } from 'src/shared/enum/txType.enum';
import { TxStatus } from 'src/shared/enum/status.enum';
import { CreditWalletTx } from '../entities/credit-wallet-tx.entity';

type ClaimResponse = {
  error: string;
  data: any;
};

type ClaimEvent = {
  userId: number;
  txHash: string;
  walletTxId: number;
  gameUsdTxId: number;
  betOrderIds: number[];
};

@Injectable()
export class ClaimService {
  provider = new ethers.JsonRpcProvider(process.env.OPBNB_PROVIDER_RPC_URL);

  constructor(
    @InjectRepository(UserWallet)
    private userWalletRepository: Repository<UserWallet>,
    @InjectRepository(BetOrder)
    private betOrderRepository: Repository<BetOrder>,
    @InjectRepository(Game)
    private gameRepository: Repository<Game>,
    @InjectRepository(ClaimDetail)
    private claimDetailRepository: Repository<ClaimDetail>,
    @InjectRepository(WalletTx)
    private walletTxRepository: Repository<WalletTx>,
    @InjectRepository(CreditWalletTx)
    private creditWalletTxRepository: Repository<CreditWalletTx>,
    @InjectRepository(DrawResult)
    private drawResultRepository: Repository<DrawResult>,
    @InjectRepository(PointTx)
    private pointTxRepository: Repository<PointTx>,
    @InjectRepository(GameUsdTx)
    private gameUsdTxRepository: Repository<GameUsdTx>,
    private dataSource: DataSource,
    private adminNotificationService: AdminNotificationService,
    private eventEmitter: EventEmitter2,
    private userService: UserService,
  ) {}

  async claim(userId: number): Promise<ClaimResponse> {
    // claim is not available within 5 minutes after last game ended
    const lastGame = await this.gameRepository.findOneBy({ isClosed: true });
    if (!lastGame) return { error: 'Claim is not available yet', data: null };
    if (
      new Date().getTime() <
      new Date(lastGame.endDate).getTime() + 5 * 60 * 1000
    ) {
      return { error: 'Claim is not available yet', data: null };
    }

    const wallet = await this.userWalletRepository.findOne({
      where: { userId },
    });

    // check if there is any pending claim
    const lastClaimWalletTx = await this.walletTxRepository.findOne({
      where: {
        txType: WalletTxType.CLAIM,
        userWalletId: wallet.id,
        status: Not(TxStatus.SUCCESS),
      },
    });
    if (lastClaimWalletTx) {
      return { error: 'Claim is in pending', data: null };
    }

    // fetch betOrders that have not been claimed
    const claimRes = await this.getPendingClaim(userId);
    const betOrders: BetOrder[] = claimRes.data;
    if (betOrders.length === 0) {
      return { error: 'No bet order available for claim', data: null };
    }

    // create walletTx
    const userWallet = await this.userWalletRepository.findOne({
      where: { userId },
      relations: { pointTx: true },
    });
    const walletTx = this.walletTxRepository.create({
      txType: WalletTxType.CLAIM,
      txAmount: 0,
      txHash: null,
      status: TxStatus.PENDING,
      startingBalance: null,
      endingBalance: null,
      userWalletId: userWallet.id,
      claimDetails: [],
      gameUsdTx: null,
    });
    await this.walletTxRepository.save(walletTx);

    // create gameUsdTx
    const gameUsdTx = this.gameUsdTxRepository.create({
      amount: 0,
      chainId: Number(process.env.BASE_CHAIN_ID),
      status: TxStatus.PENDING,
      txHash: null,
      senderAddress: userWallet.walletAddress,
      receiverAddress: userWallet.walletAddress,
      retryCount: 0,
      walletTxId: walletTx.id,
    });
    await this.gameUsdTxRepository.save(gameUsdTx);

    // set gameUsdTx to walletTx
    walletTx.gameUsdTx = gameUsdTx;
    await this.walletTxRepository.save(walletTx);

    // start queryRunner
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const claimParams: ICore.ClaimParamsStruct[] = [];
      let totalPointAmount = 0;

      for (const betOrder of betOrders) {
        // fetch drawResult for each betOrder
        const drawResult = await this.drawResultRepository.findOne({
          where: {
            gameId: betOrder.gameId,
            numberPair: betOrder.numberPair,
          },
        });

        // calculate winning amount
        // a betOrder might include both big and small forecast
        const { bigForecastWinAmount, smallForecastWinAmount } =
          this.calculateWinningAmount(betOrder, drawResult);
        const totalWinningAmount =
          bigForecastWinAmount + smallForecastWinAmount;

        // totalWinningAmount should not be 0 because is checked in betOrder.availableClaim when set result
        // this is just a double check
        if (totalWinningAmount === 0) {
          throw new Error('Bet order not available for claim');
        }

        // calculate pointAmount
        const prize = drawResult.prizeCategory;
        const calculatePointAmount = (amount: number): number => {
          return prize === '1'
            ? amount * 50_000_000
            : prize === '2'
              ? amount * 20_000_000
              : prize === '3'
                ? amount * 10_000_000
                : prize === 'S'
                  ? amount * 3_000_000
                  : amount * 1_000_000; // prize === 'C'
        };
        let pointAmount = 0;
        // it is possible that one numberPair has both big and small forecast(thus win both)
        if (bigForecastWinAmount > 0) {
          const betAmount = betOrder.bigForecastAmount;
          pointAmount += calculatePointAmount(betAmount);
        }
        if (smallForecastWinAmount > 0) {
          // smallForecastWinAmount is 0 when prize != '1' | '2' | '3'
          // hence it is safe to use same calculatePointAmount()
          const betAmount = betOrder.smallForecastAmount;
          pointAmount += calculatePointAmount(betAmount);
        }

        // create claimDetail
        const claimDetail = this.claimDetailRepository.create({
          prize,
          claimAmount: totalWinningAmount,
          bonusAmount: 0,
          pointAmount,
          walletTxId: walletTx.id,
          drawResultId: drawResult.id,
          betOrder,
        });
        await queryRunner.manager.save(claimDetail);

        // update totalPointAmount for pointTx
        totalPointAmount += pointAmount;

        // update walletTx
        // accumulate walletTx.txAmount within betOrders loop
        walletTx.txAmount =
          Number(walletTx.txAmount) + Number(totalWinningAmount);
        walletTx.claimDetails.push(claimDetail);
        await queryRunner.manager.save(walletTx);

        // construct claimParams for on-chain transaction
        const epoch = Number(
          (await this.gameRepository.findOneBy({ id: betOrder.gameId })).epoch,
        );
        const numberPair = ethers.toBigInt(Number(betOrder.numberPair));
        const drawResultIndex = drawResult.prizeIndex;
        // smart contract treat big forecast and small forecast as separate claim
        if (bigForecastWinAmount > 0) {
          const amount = ethers.parseEther(
            betOrder.bigForecastAmount.toString(),
          );
          // betOrder treat 2 bets with same numberPair same forecast as 2 bets
          // but on-chain claim treat 2 bets with same numberPair same forecast as 1 bet(with accumulated amount)
          // hence we need to accumulate betOrder amount for same numberPair same forecast (and same epoch)
          const claimParamsIndex = claimParams.findIndex(
            (claimParam) =>
              claimParam.number === numberPair &&
              claimParam.epoch === epoch &&
              claimParam.forecast === 1,
          );
          if (claimParamsIndex !== -1) {
            // there is already a claimParam for same numberPair, forecast & epoch
            // just accumulate the amount
            claimParams[claimParamsIndex].amount =
              ethers.toBigInt(claimParams[claimParamsIndex].amount) + amount;
          } else {
            claimParams.push({
              epoch,
              number: numberPair,
              amount,
              forecast: 1,
              drawResultIndex,
            });
          }
        }
        if (smallForecastWinAmount > 0) {
          const amount = ethers.parseEther(
            betOrder.smallForecastAmount.toString(),
          );
          // refer above
          const claimParamsIndex = claimParams.findIndex(
            (claimParam) =>
              claimParam.number === numberPair &&
              claimParam.epoch === epoch &&
              claimParam.forecast === 0,
          );
          if (claimParamsIndex !== -1) {
            claimParams[claimParamsIndex].amount =
              ethers.toBigInt(claimParams[claimParamsIndex].amount) + amount;
          } else {
            claimParams.push({
              epoch,
              number: numberPair,
              amount: ethers.parseEther(
                betOrder.smallForecastAmount.toString(),
              ),
              forecast: 0,
              drawResultIndex,
            });
          }
        }

        // update betOrder
        betOrder.isClaimed = true;
        await queryRunner.manager.save(betOrder);
      }

      // fetch endingBalance of last pointTx and create new pointTx
      const pointTx = this.pointTxRepository.create({
        txType: PointTxType.CLAIM,
        amount: totalPointAmount,
        startingBalance: userWallet.pointBalance,
        endingBalance: Number(userWallet.pointBalance) + totalPointAmount,
        walletId: userWallet.id,
        userWallet,
        walletTxId: walletTx.id,
        walletTx,
      });
      await queryRunner.manager.save(pointTx);

      // update walletTx
      walletTx.pointTx = pointTx;
      await queryRunner.manager.save(walletTx);

      // update userWallet
      userWallet.pointBalance =
        Number(userWallet.pointBalance) + totalPointAmount;
      userWallet.pointTx.push(pointTx);
      await queryRunner.manager.save(userWallet);

      // submit transaction on-chain at once for all claims
      const signer = new ethers.Wallet(
        await MPC.retrievePrivateKey(userWallet.walletAddress),
        this.provider,
      );
      const coreContract = Core__factory.connect(
        process.env.CORE_CONTRACT_ADDRESS,
        signer,
      );
      // calculate estimate gas used by on-chain transaction
      const estimatedGas = await coreContract.claim.estimateGas(
        userWallet.walletAddress,
        claimParams,
      );
      const txResponse = await coreContract.claim(
        userWallet.walletAddress,
        claimParams,
        // increase gasLimit by 30%
        {
          gasLimit:
            (estimatedGas * ethers.toBigInt(130)) / ethers.toBigInt(100),
        },
      );

      // update walletTx
      walletTx.txHash = txResponse.hash;
      await queryRunner.manager.save(walletTx);

      // pass to handleClaimEvent() to check & update database
      const eventPayload: ClaimEvent = {
        userId,
        txHash: txResponse.hash,
        walletTxId: walletTx.id,
        gameUsdTxId: gameUsdTx.id,
        betOrderIds: betOrders.map((betOrder) => betOrder.id),
      };
      this.eventEmitter.emit('wallet.claim', eventPayload);

      // check native token balance for user wallet
      this.eventEmitter.emit(
        'gas.service.reload',
        userWallet.walletAddress,
        Number(process.env.BASE_CHAIN_ID),
      );

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();

      // update walletTx
      walletTx.status = TxStatus.PENDING_DEVELOPER;
      await this.walletTxRepository.save(walletTx);

      // inform admin for rollback transaction
      await this.adminNotificationService.setAdminNotification(
        `Transaction in claim.service.claim had been rollback, error: ${err}`,
        'rollbackTxError',
        'Transaction Rollbacked',
        true,
        false,
        walletTx.id,
      );
      return { error: err.message, data: null };
    } finally {
      await queryRunner.release();
    }

    // return walletTxs
    return { error: null, data: { walletTx: walletTx } };
  }

  @OnEvent('wallet.claim', { async: true })
  async handleClaimEvent(payload: ClaimEvent): Promise<void> {
    // fetch txResponse from hash and wait for txReceipt
    const txResponse = await this.provider.getTransaction(payload.txHash);
    const txReceipt = await txResponse.wait();

    const walletTx = await this.walletTxRepository.findOne({
      where: { id: payload.walletTxId },
      relations: { userWallet: true },
    });

    // start queryRunner
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      if (txReceipt.status === 1) {
        const totalPointAmount = 0;

        // update GameUsdTx
        const gameUsdTx = await this.gameUsdTxRepository.findOneBy({
          id: payload.gameUsdTxId,
        });
        gameUsdTx.amount = walletTx.txAmount;
        gameUsdTx.status = TxStatus.SUCCESS;
        gameUsdTx.txHash = txReceipt.hash;
        await queryRunner.manager.save(gameUsdTx);

        // update walletTx
        const userWallet = await this.userWalletRepository.findOneBy({
          id: walletTx.userWalletId,
        });
        walletTx.startingBalance = userWallet.walletBalance;
        walletTx.endingBalance =
          Number(walletTx.startingBalance) + Number(walletTx.txAmount);
        walletTx.status = TxStatus.SUCCESS;
        await queryRunner.manager.save(walletTx);

        userWallet.walletBalance =
          Number(userWallet.walletBalance) + Number(walletTx.txAmount);
        // userWallet.redeemableBalance =
        // Number(userWallet.redeemableBalance) + Number(walletTx.txAmount);
        userWallet.pointBalance =
          Number(userWallet.pointBalance) + totalPointAmount;
        await queryRunner.manager.save(userWallet);
      } else {
        // txReceipt.status === 0
        // inform admin for failed on-chain claim tx
        await this.adminNotificationService.setAdminNotification(
          `claim() of Core contract failed, please check. Tx hash: ${txReceipt.hash}`,
          'onChainTxError',
          'Claim Failed',
          true,
          false,
          walletTx.id,
        );
      }

      await queryRunner.commitTransaction();
    } catch (err) {
      // rollback queryRunner
      await queryRunner.rollbackTransaction();

      // update walletTx
      walletTx.status = TxStatus.PENDING_DEVELOPER;
      await queryRunner.manager.save(walletTx);

      // inform admin for rollback transaction
      await this.adminNotificationService.setAdminNotification(
        `Transaction in claim.service.handleClaimEvent had been rollback, error: ${err}`,
        'rollbackTxError',
        'Transaction Rollbacked',
        true,
        false,
        walletTx.id,
      );
    } finally {
      // finalize queryRunner
      await queryRunner.release();

      await this.userService.setUserNotification(payload.userId, {
        type: 'claim',
        title: 'Claim Processed Successfully',
        message: 'Your claim has been successfully processed',
        walletTxId: walletTx.id,
      });
    }
  }

  async getPendingClaimByGameUsdTxId(gameUsdTxId: number): Promise<{
    totalWinningAmount: number;
    drawResults: DrawResult[];
  }> {
    const betOrders = await this.betOrderRepository.find({
      where: {
        gameUsdTx: {
          id: gameUsdTxId,
        },
        availableClaim: true,
        isClaimed: false,
      },
    });

    if (betOrders.length === 0) {
      return {
        totalWinningAmount: 0,
        drawResults: [],
      };
    }

    const drawResults = await this.drawResultRepository.find({
      where: {
        gameId: In(betOrders.map((betOrder) => betOrder.gameId)),
      },
    });

    let totalWinningAmount = 0;
    for (const betOrder of betOrders) {
      const _drawResult = drawResults.find(
        (dr) =>
          dr.gameId === betOrder.gameId &&
          dr.numberPair === betOrder.numberPair,
      );

      if (!_drawResult) {
        continue;
      }

      const { bigForecastWinAmount, smallForecastWinAmount } =
        this.calculateWinningAmount(betOrder, _drawResult);
      totalWinningAmount += bigForecastWinAmount + smallForecastWinAmount;
    }
    return { totalWinningAmount, drawResults };
  }

  async getPendingClaim(userId: number): Promise<ClaimResponse> {
    // fetch user walletTxs for query, where the walletTx is with betOrder(txType PLAY), and status success
    const userWallet = await this.userWalletRepository.findOneBy({ userId });
    const walletTxs = await this.walletTxRepository.find({
      where: {
        userWalletId: userWallet.id,
        txType: WalletTxType.PLAY,
        status: TxStatus.SUCCESS,
      },
    });

    // fetch user creditWalletTxs for query, where the creditWalletTx is with betOrder(txType PLAY), and status success
    const creditWalletTxs = await this.creditWalletTxRepository
      .createQueryBuilder('creditWalletTx')
      .where('creditWalletTx.userWalletId = :userWalletId', {
        userWalletId: userWallet.id,
      })
      .andWhere('creditWalletTx.txType = :txType', {
        txType: WalletTxType.PLAY,
      })
      .andWhere('creditWalletTx.status = :status', {
        status: TxStatus.SUCCESS,
      })
      .getMany();

    const allWalletTxs = [...walletTxs, ...creditWalletTxs];

    let betOrders: BetOrder[] = [];
    for (const walletTx of allWalletTxs) {
      const _betOrders = await this.betOrderRepository
        .createQueryBuilder('betOrder')
        .where(
          '(betOrder.walletTxId = :walletTxId OR betOrder.creditWalletTxId = :creditTxId)',
          {
            walletTxId: walletTx instanceof WalletTx ? walletTx.id : null,
            creditTxId: walletTx instanceof CreditWalletTx ? walletTx.id : null,
          },
        )
        .andWhere('betOrder.availableClaim = :availableClaim', {
          availableClaim: true,
        })
        .andWhere('betOrder.isClaimed = :isClaimed', {
          isClaimed: false,
        })
        .getMany();

      betOrders = [...betOrders, ..._betOrders];
    }

    return {
      error: null,
      data: betOrders,
    };
  }

  async getPendingClaimAmount(userId: number): Promise<number> {
    const res = await this.getPendingClaim(userId);
    const betOrders: BetOrder[] = res.data;
    let totalWinningAmount = 0;
    for (const betOrder of betOrders) {
      // fetch drawResult for each betOrder
      const drawResult = await this.drawResultRepository.findOne({
        where: {
          gameId: betOrder.gameId,
          numberPair: betOrder.numberPair,
        },
      });

      // calculate winning amount
      // a betOrder might include both big and small forecast
      const { bigForecastWinAmount, smallForecastWinAmount } =
        this.calculateWinningAmount(betOrder, drawResult);
      totalWinningAmount += bigForecastWinAmount + smallForecastWinAmount;
    }
    return totalWinningAmount;
  }

  calculateWinningAmount(
    betOrder: BetOrder,
    drawResult: DrawResult,
  ): {
    bigForecastWinAmount: number;
    smallForecastWinAmount: number;
  } {
    let bigForecastWinAmount = 0;
    let smallForecastWinAmount = 0;
    if (drawResult.prizeCategory === '1') {
      bigForecastWinAmount += Number(betOrder.bigForecastAmount) * 2500;
      smallForecastWinAmount += Number(betOrder.smallForecastAmount) * 4000;
    } else if (drawResult.prizeCategory === '2') {
      bigForecastWinAmount += Number(betOrder.bigForecastAmount) * 1000;
      smallForecastWinAmount += Number(betOrder.smallForecastAmount) * 2000;
    } else if (drawResult.prizeCategory === '3') {
      bigForecastWinAmount += Number(betOrder.bigForecastAmount) * 500;
      smallForecastWinAmount += Number(betOrder.smallForecastAmount) * 1000;
    } else if (drawResult.prizeCategory === 'S') {
      bigForecastWinAmount += Number(betOrder.bigForecastAmount) * 180;
      smallForecastWinAmount += Number(betOrder.smallForecastAmount) * 0;
    } else if (drawResult.prizeCategory === 'C') {
      bigForecastWinAmount += Number(betOrder.bigForecastAmount) * 60;
      smallForecastWinAmount += Number(betOrder.smallForecastAmount) * 0;
    }

    return {
      bigForecastWinAmount,
      smallForecastWinAmount,
    };
  }
}
