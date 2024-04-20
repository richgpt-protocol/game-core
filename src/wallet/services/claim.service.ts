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
    @InjectRepository(DrawResult)
    private drawResultRepository: Repository<DrawResult>,
    @InjectRepository(PointTx)
    private pointTxRepository: Repository<PointTx>,
    @InjectRepository(GameUsdTx)
    private gameUsdTxRepository: Repository<GameUsdTx>,
    private dataSource: DataSource,
    private adminNotificationService: AdminNotificationService,
    private eventEmitter: EventEmitter2,
  ) {}

  async claim(userId: number): Promise<ClaimResponse> {
    // claim is not available within 5 minutes after last game ended
    const lastGame = await this.gameRepository.findOneBy({ isClosed: true });
    if (!lastGame) return { error: 'Claim is not available yet', data: null }
    if (new Date().getTime() < new Date(lastGame.endDate).getTime() + (5 * 60 * 1000)) {
      return { error: 'Claim is not available yet', data: null };
    }

    // check if there is any pending claim
    const lastClaimWalletTx = await this.walletTxRepository
      .createQueryBuilder()
      .where('txType = :txType', { txType: 'CLAIM' })
      .andWhere('userWalletId = :userWalletId', { userWalletId: userId })
      .orWhere('status = :status', { status: 'P' })
      .orWhere('status = :status', { status: 'PD' })
      .getOne();
    if (lastClaimWalletTx) {
      return { error: 'Claim is in pending', data: null };
    }

    // fetch betOrders that have not been claimed
    const claimRes = await this.getPendingClaim(userId);
    const betOrders: BetOrder[] = claimRes.data;
    if (betOrders.length === 0) {
      return { error: "No bet order available for claim", data: null };
    }

    // create walletTx
    const userWallet = await this.userWalletRepository.findOneBy({ userId });
    const walletTx = this.walletTxRepository.create({
      txType: 'CLAIM',
      txAmount: 0,
      txHash: null,
      status: 'P',
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
      chainId: Number(process.env.OPBNB_CHAIN_ID),
      status: 'P',
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
      let claimParams: ICore.ClaimParamsStruct[] = [];

      // loop through the betOrders to check if available for claim
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
        const {
          bigForecastWinAmount, smallForecastWinAmount
        } = this.calculateWinningAmount(
          betOrder,
          drawResult,
        );
        const totalWinningAmount = bigForecastWinAmount + smallForecastWinAmount;

        // totalWinningAmount should not be 0 because is checked in betOrder.availableClaim when set result
        // this is just a double check
        if (totalWinningAmount === 0) {
          throw new Error('Bet order not available for claim');
        }

        // calculate pointAmount
        const prize = drawResult.prizeCategory;
        const calculatePointAmount = (amount: number): number => {
          return prize === '1' ? amount * 50000
            : prize === '2' ? amount * 20000
            : prize === '3' ? amount * 10000
            : prize === 'S' ? amount * 3000
            : amount * 1000; // prize === 'C'
        }
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

        // create pointTx for each betOrder
        const pointTx = this.pointTxRepository.create({
          txType: 'CLAIM',
          amount: pointAmount,
          startingBalance: null,
          endingBalance: null,
          userWallet,
          walletTx,
        });
        await queryRunner.manager.save(pointTx);

        // update walletTx
        // accumulate walletTx.txAmount within betOrders loop
        walletTx.txAmount = Number(walletTx.txAmount) + Number(totalWinningAmount);
        walletTx.claimDetails.push(claimDetail);
        await queryRunner.manager.save(walletTx);

        // update userWallet
        userWallet.pointTx.push(pointTx);
        await queryRunner.manager.save(userWallet);

        // construct claimParams for on-chain transaction
        const epoch = Number(
          (await this.gameRepository.findOneBy({ id: betOrder.gameId }))
          .epoch
        );
        const numberPair = ethers.toBigInt(Number(betOrder.numberPair))
        const drawResultIndex = drawResult.prizeIndex
        // smart contract treat big forecast and small forecast as separate claim
        if (bigForecastWinAmount > 0) {
          claimParams.push({
            epoch,
            number: numberPair,
            amount: ethers.parseEther(betOrder.bigForecastAmount.toString()),
            forecast: 1,
            drawResultIndex
          })
        }
        if (smallForecastWinAmount > 0) {
          claimParams.push({
            epoch,
            number: numberPair,
            amount: ethers.parseEther(betOrder.smallForecastAmount.toString()),
            forecast: 0,
            drawResultIndex
          })
        }
      }

      // submit transaction on-chain at once for all claims
      const signer = new ethers.Wallet(userWallet.privateKey, this.provider);
      const coreContract = Core__factory.connect(process.env.CORE_CONTRACT_ADDRESS, signer);
      // calculate estimate gas used by on-chain transaction
      const estimatedGas = await coreContract.claim.estimateGas(
        userWallet.walletAddress,
        claimParams,
      );
      const txResponse = await coreContract.claim(
        userWallet.walletAddress,
        claimParams,
        // increase gasLimit by 30%
        { gasLimit: estimatedGas * ethers.toBigInt(130) / ethers.toBigInt(100) },
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
        betOrderIds: betOrders.map(betOrder => betOrder.id),
      }
      this.eventEmitter.emit('wallet.claim', eventPayload);

      // check native token balance for user wallet
      this.eventEmitter.emit(
        'gas.service.reload',
        userWallet.walletAddress,
        Number(process.env.OPBNB_CHAIN_ID),
      );

      await queryRunner.commitTransaction();

    } catch (err) {
      await queryRunner.rollbackTransaction();

      // update walletTx
      walletTx.status = 'PD';
      await this.walletTxRepository.save(walletTx);

      // inform admin for rollback transaction
      await this.adminNotificationService.setAdminNotification(
        `Transaction in claim.service.claim had been rollback, error: ${err}`,
        'rollbackTxError',
        'Transaction Rollbacked',
        true,
        walletTx.id
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
        let totalPointAmount = 0;

        for (const betOrderId of payload.betOrderIds) {
          // update betOrder
          const betOrder = await this.betOrderRepository.findOneBy({ id: betOrderId });
          betOrder.isClaimed = true;
          await queryRunner.manager.save(betOrder);
  
          // update pointTx for each betOrder
          // fetch latest valid pointTx, use queryRunner to query instead of pointTxRepository because,
          // pointTxRepository is not aware of the pointTx saved by queryRunner before commitTransaction()
          const latestPointTx = await queryRunner.manager.findOne(PointTx, {
            where: {
              startingBalance: Not(null),
              endingBalance: Not(null),
            },
          });
          const pointTx = await this.pointTxRepository.
            createQueryBuilder('pointTx')
            .where('pointTx.betOrderId = :betOrderId', { betOrderId })
            .getOne();
          pointTx.startingBalance = latestPointTx.endingBalance;
          pointTx.endingBalance = Number(pointTx.startingBalance) + Number(pointTx.amount);
          totalPointAmount += pointTx.amount;
          await queryRunner.manager.save(pointTx);
        }

        // update GameUsdTx
        const gameUsdTx = await this.gameUsdTxRepository.findOneBy({ id: payload.gameUsdTxId });
        gameUsdTx.amount = walletTx.txAmount;
        gameUsdTx.status = 'S';
        gameUsdTx.txHash = txReceipt.hash;
        await queryRunner.manager.save(gameUsdTx);

        // update walletTx
        const latestWalletTx = await this.walletTxRepository.findOne({
          where: { userWalletId: payload.userId, status: 'S' },
          order: { id: 'DESC' },
        });
        walletTx.startingBalance = latestWalletTx.endingBalance;
        walletTx.endingBalance = Number(walletTx.startingBalance) + Number(walletTx.txAmount);
        walletTx.status = 'S';
        await queryRunner.manager.save(walletTx);

        // update userWallet
        const userWallet = await this.userWalletRepository.findOneBy({ id: walletTx.userWalletId });
        userWallet.walletBalance = Number(userWallet.walletBalance) + Number(walletTx.txAmount);
        userWallet.redeemableBalance = Number(userWallet.redeemableBalance) + Number(walletTx.txAmount);
        userWallet.pointBalance = Number(userWallet.pointBalance) + totalPointAmount;
        await queryRunner.manager.save(userWallet);

      } else { // txReceipt.status === 0
        // inform admin for failed on-chain claim tx
        await this.adminNotificationService.setAdminNotification(
          `claim() of Core contract failed, please check. Tx hash: ${txReceipt.hash}`,
          'onChainTxError',
          'Claim Failed',
          true,
          walletTx.id
        );
      }

      await queryRunner.commitTransaction();

    } catch (err) {
      // rollback queryRunner
      await queryRunner.rollbackTransaction();

      // update walletTx
      walletTx.status = 'PD';
      await queryRunner.manager.save(walletTx);

      // inform admin for rollback transaction
      await this.adminNotificationService.setAdminNotification(
        `Transaction in claim.service.handleClaimEvent had been rollback, error: ${err}`,
        'rollbackTxError',
        'Transaction Rollbacked',
        true,
        walletTx.id
      );

    } finally {
      // finalize queryRunner
      await queryRunner.release();
    }
  }

  async getPendingClaimByWalletTxId(walletTxId: number): Promise<number> {
    const betOrders = await this.betOrderRepository.find({
      where: {
        walletTxId,
        availableClaim: true,
        isClaimed: false,
      },
    });

    if (betOrders.length === 0) {
      return 0;
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
    return totalWinningAmount;
  }

  async getPendingClaim(userId: number): Promise<ClaimResponse> {
    // fetch user walletTxs for query, where the walletTx is with betOrder(txType PLAY), and status success
    const userWallet = await this.userWalletRepository.findOneBy({ userId });
    const walletTxs = await this.walletTxRepository.find({
      where: {
        userWalletId: userWallet.id,
        txType: 'PLAY',
        status: 'S'
      },
    });

    // fetch all betOrders that available for claim
    let betOrders: BetOrder[] = []
    for (const walletTx of walletTxs) {
      const _betOrders = await this.betOrderRepository.find({
        where: {
          walletTxId: walletTx.id,
          // availableClaim=true only after live results end
          // so this function won't return matched numberPair within live results
          availableClaim: true,
          isClaimed: false
        },
      });
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
      const {
        bigForecastWinAmount, smallForecastWinAmount
      } = this.calculateWinningAmount(
        betOrder,
        drawResult,
      );
      totalWinningAmount += bigForecastWinAmount + smallForecastWinAmount;
    }
    return totalWinningAmount;
  }

  calculateWinningAmount(betOrder: BetOrder, drawResult: DrawResult): {
    bigForecastWinAmount: number,
    smallForecastWinAmount: number
  } {
    let bigForecastWinAmount = 0;
    let smallForecastWinAmount = 0;
    if (drawResult.prizeCategory === '1') {
      bigForecastWinAmount += betOrder.bigForecastAmount * 2500;
      smallForecastWinAmount += betOrder.smallForecastAmount * 3500;
    } else if (drawResult.prizeCategory === '2') {
      bigForecastWinAmount += betOrder.bigForecastAmount * 1000;
      smallForecastWinAmount += betOrder.smallForecastAmount * 2000;
    } else if (drawResult.prizeCategory === '3') {
      bigForecastWinAmount += betOrder.bigForecastAmount * 500;
      smallForecastWinAmount += betOrder.smallForecastAmount * 1000;
    } else if (drawResult.prizeCategory === 'S') {
      bigForecastWinAmount += betOrder.bigForecastAmount * 180;
      smallForecastWinAmount += betOrder.smallForecastAmount * 0;
    } else if (drawResult.prizeCategory === 'C') {
      bigForecastWinAmount += betOrder.bigForecastAmount * 60;
      smallForecastWinAmount += betOrder.smallForecastAmount * 0;
    }

    return {
      bigForecastWinAmount,
      smallForecastWinAmount
    }
  }
}
