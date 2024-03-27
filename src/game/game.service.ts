import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Game } from './entities/game.entity';
import { DrawResult } from './entities/draw-result.entity';
import { BetOrder } from './entities/bet-order.entity';
import { Cron } from '@nestjs/schedule';
import { ethers } from 'ethers';
import { Core__factory, Helper__factory } from 'src/contract';
import { IHelper, ICore } from 'src/contract/Helper';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class GameService {
  provider = new ethers.JsonRpcProvider(process.env.OPBNB_PROVIDER_RPC_URL);

  constructor(
    @InjectRepository(Game)
    private gameRepository: Repository<Game>,
    @InjectRepository(DrawResult)
    private drawResultRepository: Repository<DrawResult>,
    @InjectRepository(BetOrder)
    private betOrderRepository: Repository<BetOrder>,
    @InjectRepository(WalletTx)
    private walletTxRepository: Repository<WalletTx>,
    private adminNotificationService: AdminNotificationService,
  ) {}

  async getDrawResult(epoch: number) {
    const game = await this.gameRepository.findOneBy({
      epoch: epoch.toString(),
    });
    const drawResult = await this.drawResultRepository
      .createQueryBuilder('row')
      .where({ game })
      .getOne();
    return drawResult;
  }

  // process of closing bet for current epoch, set draw result, and announce draw result
  // 1. GameService.setBetClose: scheduled at :00UTC, also submit masked betOrder to Core contract
  // 2. Local script: cron at :01UTC create drawResult records and save directly into database
  // 3. GameGateway.emitDrawResult: scheduled at :02UTC, emit draw result to all connected clients
  // 4. follow by GameService.updateDrawResult: submit draw result to Core contract
  // 5. :05UTC, allow claim

  @Cron('0 0 */1 * * *', { utcOffset: 0 }) // every hour UTC time
  async setBetClose(): Promise<void> {
    try {
      // set bet close in game record for current epoch
      const game = await this.gameRepository.findOne({
        where: { isClosed: false },
      });
      game.isClosed = true;
      await this.gameRepository.save(game);

      // submit masked betOrder on-chain
      const betOrders = await this.betOrderRepository.find({
        where: {
          gameId: game.id,
          isMasked: true,
        },
      });
      // temporarily, private key will fetch shares from mpc server via address and combine
      const helperBot = new ethers.Wallet(process.env.HELPER_BOT_PRIVATE_KEY, this.provider);
      const helperContract = Helper__factory.connect(process.env.HELPER_CONTRACT_ADDRESS, helperBot);
      // construct params for Helper.betLastMinutes()
      // [key: string] is userWalletAddress, one user might have multiple bets
      const userBets: { [key: string]: ICore.BetParamsStruct[] } = {}
      for (let i = 0; i < betOrders.length; i++) {
        const betOrder = betOrders[i];
        const walletTx = await this.walletTxRepository.findOne({
          where: { id: betOrder.walletTxId },
          relations: { userWallet: true }
        })
        const userAddress = walletTx.userWallet.walletAddress;
        if (!userBets[userAddress]) userBets[userAddress] = [];
        // big forecast & small forecast is treat as separate bet in contract
        const bigForecastAmount = Number(betOrder.bigForecastAmount);
        if (bigForecastAmount > 0) {
          userBets[userAddress].push({
            epoch: game.epoch,
            number: Number(betOrder.numberPair), // contract treat numberPair as uint256
            amount: ethers.parseEther(bigForecastAmount.toString()),
            forecast: 1, // big
          });
        }
        const smallForecastAmount = Number(betOrder.smallForecastAmount);
        if (smallForecastAmount > 0) {
          userBets[userAddress].push({
            epoch: game.epoch,
            number: Number(betOrder.numberPair), // contract treat numberPair as uint256
            amount: ethers.parseEther(smallForecastAmount.toString()),
            forecast: 0, // small
          });
        }
      }
      const params: IHelper.BetLastMinuteParamsStruct[] = [];
      for (let userAddress in userBets) {
        params.push({
          user: userAddress,
          bets: userBets[userAddress],
        })
      }
      const estimatedGas = await helperContract.betLastMinutes.estimateGas(params);
      const txResponse = await helperContract.betLastMinutes(params, {
        // increase gasLimit by 30%
        gasLimit: estimatedGas * ethers.toBigInt(13) / ethers.toBigInt(10),
      });
      const txReceipt = await txResponse.wait();

      if (txReceipt.status === 1) { // tx success
        // update walletTx status & txHash for each betOrders
        for (const betOrder of betOrders) {
          const walletTx = await this.walletTxRepository.findOne({
            where: { id: betOrder.walletTxId },
          })
          walletTx.txHash = txReceipt.hash;
          walletTx.status = 'S';
          await this.walletTxRepository.save(walletTx);
        }

      } else { // tx failed
        for (const betOrder of betOrders) {
          // only update txHash for each betOrders, status remain pending
          const walletTx = await this.walletTxRepository.findOne({
            where: { id: betOrder.walletTxId },
          })
          walletTx.txHash = txReceipt.hash;
          await this.walletTxRepository.save(walletTx);
        }

        throw new Error(`betLastMinutes() on-chain transaction failed, txHash: ${txReceipt.hash}`)
      }

    } catch (err) {
      // inform admin
      await this.adminNotificationService.setAdminNotification(
        `Error occur in game.service.setBetClose, error: ${err}`,
        'ExecutionError',
        'Execution Error in setBetClose()',
        true,
      );
    }
  }

  // this function called by emitDrawResult() in game.gateway
  async updateDrawResult(payload: DrawResult[], gameId: number): Promise<void> {
    try {
      // submit draw result to Core contract
      const setDrawResultBot = new ethers.Wallet(process.env.RESULT_BOT_PRIVATE_KEY, this.provider); // temporarily
      const coreContract = Core__factory.connect(process.env.CORE_CONTRACT_ADDRESS, setDrawResultBot);
      const numberPairs = payload.map((result) => result.numberPair);
      const txResponse = await coreContract.setDrawResults(
        numberPairs,
        ethers.parseEther(process.env.MAX_BET_AMOUNT),
        '0x',
        { gasLimit: 1100000 }
      );
      const txReceipt = await txResponse.wait();

      // update txHash into game record
      const game = await this.gameRepository.findOneBy({ id: gameId });
      game.drawTxHash = txReceipt.hash;
      game.drawTxStatus = 'P';
      await this.gameRepository.save(game);

      if (txReceipt.status === 1) { // on-chain tx success
        game.drawTxStatus = 'S';
        await this.gameRepository.save(game);

        // find betOrder that numberPair matched and update availableClaim to true
        for (const result of payload) {
          const betOrders = await this.betOrderRepository.find({
            where: {
              gameId,
              numberPair: result.numberPair,
            }
          });
          // there might be more than 1 betOrder that numberPair matched
          for (const betOrder of betOrders) {
            betOrder.availableClaim = true;
            await this.betOrderRepository.save(betOrder);
          }
        }

      } else { // on-chain tx failed
        throw new Error(`setDrawResults() on-chain transaction failed, txHash: ${txReceipt.hash}`);
      }

    } catch (err) {
      await this.adminNotificationService.setAdminNotification(
        `Error in game.service.updateDrawResult, error: ${err}`,
        'executionError',
        'Execution Error in updateDrawResult()',
        true,
      );
    }
  }

  async getAllBets() {
    try {
      const game = await this.gameRepository.findOne({
        where: { isClosed: false },
        order: { id: 'DESC' },
      });
      return { error: null, data: game.betOrders };

    } catch (error) {
      return { error: error, data: null };
    }
  }
}
