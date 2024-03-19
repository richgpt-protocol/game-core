import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Game } from 'src/game/entities/game.entity';
import { DataSource, Repository } from 'typeorm';
import { ClaimDto } from '../dto/claim.dto';
import { UserWallet } from '../entities/user-wallet.entity';
import { ClaimTx } from '../entities/claim-tx.entity';
import { BetOrder } from 'src/game/entities/bet-order.entity';
import { WalletTx } from '../entities/wallet-tx.entity';
import { DrawResult } from 'src/game/entities/draw-result.entity';
import { ethers } from 'ethers';
import { Core__factory } from 'src/contract';
import { ICore } from 'src/contract/Core';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';

type ClaimResponse = {
  error: string;
  data: any;
};

type ClaimEvent = {
  userId: number;
  txHash: string;
  walletTxId: number;
  betOrderIds: number[];
};

interface BetOrderPendingClaim extends BetOrder {
  bigForcastWinAmount: number;
  smallForecastWinAmount: number;
}

@Injectable()
export class ClaimService {
  provider = new ethers.JsonRpcProvider(process.env.PROVIDER_RPC_URL);

  constructor(
    @InjectRepository(ClaimTx)
    private claimRepository: Repository<ClaimTx>,
    @InjectRepository(UserWallet)
    private userWalletRepository: Repository<UserWallet>,
    @InjectRepository(BetOrder)
    private betOrderRepository: Repository<BetOrder>,
    @InjectRepository(Game)
    private gameRepository: Repository<Game>,
    @InjectRepository(ClaimTx)
    private claimTxRepository: Repository<ClaimTx>,
    @InjectRepository(WalletTx)
    private walletTxRepository: Repository<WalletTx>,
    @InjectRepository(DrawResult)
    private drawResultRepository: Repository<DrawResult>,
    @InjectRepository(PointTx)
    private pointTxRepository: Repository<PointTx>,
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
  ) {}

  async claim(userId: number, payload: ClaimDto): Promise<ClaimResponse> {
    let walletTx: WalletTx;

    // start queryRunner
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      let claimParams: ICore.ClaimParamsStruct[] = [];
      let totalWinningAmount = 0;

      // loop through the betIds to check if available for claim
      for (const betId of payload.betIds) {
        // check if betOrder correct
        const betOrder = await this.betOrderRepository.findOneBy({ id: betId });
        if (!betOrder) {
          throw new Error('Bet order not found');
        }

        // check if betOrder match with drawResult
        const drawResult = await this.drawResultRepository.findOne({
          where: {
            gameId: betOrder.gameId,
            numberPair: betOrder.numberPair,
          },
        });
        if (!drawResult) {
          throw new Error('Bet order not match');
        }

        // calculate winning amount
        // a betOrder might include both big and small forecast
        const {
          bigForecastWinAmount, smallForecastWinAmount
        } = this.calculateWinningAmount(
          betOrder,
          drawResult,
        );
        const bigAndSmallWinningAmount = bigForecastWinAmount + smallForecastWinAmount;
        totalWinningAmount += bigAndSmallWinningAmount;

        // bigAndSmallWinningAmount might be 0 i.e. numberPair match special prize but bet small forecast
        if (bigAndSmallWinningAmount === 0) {
          throw new Error('Bet order not available for claim');
        }

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
            amount: bigForecastWinAmount,
            forecast: 1,
            drawResultIndex
          })
        }
        if (smallForecastWinAmount > 0) {
          claimParams.push({
            epoch,
            number: numberPair,
            amount: smallForecastWinAmount,
            forecast: 0,
            drawResultIndex
          })
        }
      }

      // fetch last endingBalance
      const latestWalletTx = await this.walletTxRepository.findOne({
        where: { userWalletId: userId, status: 'S' },
        order: { id: 'DESC' },
      });

      // create walletTx
      walletTx = this.walletTxRepository.create({
        txType: 'CLAIM',
        txAmount: totalWinningAmount,
        status: 'P',
        startingBalance: latestWalletTx.endingBalance,
        userWalletId: userId,
      });
      await queryRunner.manager.save(walletTx);

      // create claimTx
      // TO SOLVE: check comment in Trello card, might have many claimTx to one walletTx
      const claimTx = this.claimTxRepository.create({
        // prize: drawResult.prizeCategory,
        prize: '_', // TO SOLVE
        claimAmount: totalWinningAmount,
        walletTxId: walletTx.id,
        drawResultId: 0, // TO SOLVE
        // betOrder, // TO SOLVE
      });
      await queryRunner.manager.save(claimTx);

      // submit transaction on-chain at once for all claims
      const userWallet = await this.userWalletRepository.findOneBy({ userId });
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

      // pass to handleClaimEvent() to check & update database
      const eventPayload: ClaimEvent = {
        userId,
        txHash: txResponse.hash,
        walletTxId: walletTx.id,
        betOrderIds: payload.betIds,
      }
      this.eventEmitter.emit('wallet.claim', eventPayload);

      await queryRunner.commitTransaction();

    } catch (err) {
      await queryRunner.rollbackTransaction();
      return { error: err, data: null };

    } finally {
      await queryRunner.release();
    }

    // return walletTxs
    return { error: null, data: walletTx };
  }

  @OnEvent('wallet.claim', { async: true })
  async handleClaimEvent(payload: ClaimEvent) {
    // fetch txResponse from hash and wait for txReceipt
    const txResponse = await this.provider.getTransaction(payload.txHash);
    const txReceipt = await txResponse.wait();
    let status: 'S' | 'F' = txReceipt.status === 1 ? 'S' : 'F';

    // start queryRunner
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {

      // update walletTx
      const walletTx = await this.walletTxRepository.findOneBy({ id: payload.walletTxId });
      walletTx.txHash = txReceipt.hash;
      walletTx.status = status;
      walletTx.endingBalance = status === 'S'
        ? walletTx.startingBalance + walletTx.txAmount
        : walletTx.startingBalance;
      await queryRunner.manager.save(walletTx);

      if (status === 'S') {
        for (const betOrderId of payload.betOrderIds) {
          // update betOrder
          const betOrder = await this.betOrderRepository.findOneBy({ id: betOrderId });
          betOrder.isClaimed = true;
          await queryRunner.manager.save(betOrder);
  
          // create pointTx for each betOrder
          const pointTx = this.pointTxRepository.create({
            txType: 'PAYOUT',
            amount: 0, // TODO: check xp for payout
            startingBalance: 0, // TODO: check xp for payout
            endingBalance: 0, // TODO: check xp for payout
            walletId: walletTx.userWalletId,
            betOrder
          });
          await queryRunner.manager.save(pointTx);
        }

        // update userWallet
        const userWallet = await this.userWalletRepository.findOneBy({ id: walletTx.userWalletId });
        userWallet.redeemableBalance += walletTx.txAmount;
        await queryRunner.manager.save(userWallet);
      }

      await queryRunner.commitTransaction();

    } catch (err) {
      // rollback queryRunner
      await queryRunner.rollbackTransaction();
      // TODO: notify admin

    } finally {
      // finalize queryRunner
      await queryRunner.release();
    }
  }

  async getPendingClaim(userId: number): Promise<ClaimResponse> {
    // fetch user all walletTxs for query
    const userWallet = await this.userWalletRepository.findOneBy({ userId });
    const walletTxs = await this.walletTxRepository.find({
      where: {
        userWalletId: userWallet.id,
        txType: 'PLAY',
        status: 'S'
      },
    });

    // fetch user all betOrders that isClaimed false
    const betOrders: BetOrder[] = []
    for (const walletTx of walletTxs) {
      await this.betOrderRepository.find({
        where: {
          walletTxId: walletTx.id,
          isClaimed: false
        },
      });
    }

    // loop through all betOrders, check if available for claim
    let pendingClaim: BetOrderPendingClaim[] = [];
    for (const betOrder of betOrders) {
      const drawResult = await this.drawResultRepository.findOne({
        where: {
          gameId: betOrder.gameId,
          numberPair: betOrder.numberPair,
        },
      });
      if (drawResult) {
        const {
          bigForecastWinAmount,
          smallForecastWinAmount
        } = this.calculateWinningAmount(
          betOrder,
          drawResult,
        );
        if (bigForecastWinAmount + smallForecastWinAmount > 0) {
          betOrder['bigForcastWinAmount'] = bigForecastWinAmount;
          betOrder['smallForecastWinAmount'] = smallForecastWinAmount;
          pendingClaim.push(betOrder as BetOrderPendingClaim);
        }
      }
    }

    return {
      error: null,
      data: pendingClaim,
    };
  }

  // TODO
  async getClaimStatus(walletTxId: number) {
    //
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
