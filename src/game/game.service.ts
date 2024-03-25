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

  @Cron('0 0 */1 * * *', { utcOffset: 0 }) // every hour UTC time
  async setBetClose() {
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
      
      const userBets: { [key: string]: ICore.BetParamsStruct[] } = {}
      for (let i = 0; i < betOrders.length; i++) {
        const betOrder = betOrders[i];
        const walletTx = await this.walletTxRepository.findOne({
          where: { id: betOrder.walletTxId },
          relations: { userWallet: true }
        })
        const userAddress = walletTx.userWallet.walletAddress;
        if (betOrder.bigForecastAmount > 0) {
          userBets[userAddress].push({
            epoch: game.epoch,
            number: betOrder.numberPair,
            amount: betOrder.bigForecastAmount,
            forecast: 1, // big
          });
        }
        if (betOrder.smallForecastAmount > 0) {
          userBets[userAddress].push({
            epoch: game.epoch,
            number: betOrder.numberPair,
            amount: betOrder.smallForecastAmount,
            forecast: 0, // small
          });
        }
      }
      const params: IHelper.BetLastMinuteParamsStruct[] = []
      for (let userAddress in userBets) {
        params.push({
          user: userAddress,
          bets: userBets[userAddress],
        })
      }
      const estimatedGas = await helperContract.betLastMinutes.estimateGas(params);
      const txResponse = await helperContract.betLastMinutes(params, {
        gasLimit: estimatedGas * ethers.toBigInt(13) / ethers.toBigInt(10),
      });
      const txReceipt = await txResponse.wait();

      if (txReceipt.status === 1) {
        for (const betOrder of betOrders) {
          const walletTx = await this.walletTxRepository.findOne({
            where: { id: betOrder.walletTxId },
          })
          walletTx.txHash = txReceipt.hash;
          walletTx.status = 'S';
          await this.walletTxRepository.save(walletTx);
        }

      } else {
        for (const betOrder of betOrders) {
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
        'Execution Error',
        true,
      );
    }
  }

  async updateDrawResult(payload: DrawResult[], gameId: number): Promise<void> {
    try {
      // submit draw result to Core contract
      const setDrawResultBot = new ethers.Wallet(process.env.RESULT_BOT_PRIVATE_KEY, this.provider); // temporarily
      const coreContract = Core__factory.connect(process.env.CORE_CONTRACT_ADDRESS, setDrawResultBot);
      const numberPairs = payload.map((result) => result.numberPair);
      // TODO: set gasLimit
      const txResponse = await coreContract.setDrawResults(numberPairs, process.env.MAX_BET_AMOUNT, '');
      const txReceipt = await txResponse.wait();

      // await queryRunner.manager.update(
      const game = await this.gameRepository.findOneBy({ id: gameId });
      game.drawTxHash = txReceipt.hash;
      game.drawTxStatus = 'P';
      await this.gameRepository.save(game);

      if (txReceipt.status === 1) {
        game.drawTxStatus = 'S';
        await this.gameRepository.save(game);

        for (const result of payload) {
          const betOrders = await this.betOrderRepository.find({
            where: {
              gameId,
              numberPair: result.numberPair,
            }
          });
          for (const betOrder of betOrders) {
            betOrder.availableClaim = true;
            await this.betOrderRepository.save(betOrder);
          }
        }

      } else {
        throw new Error(`setDrawResults() on-chain transaction failed, txHash: ${txReceipt.hash}`)
      }

    } catch (err) {
      await this.adminNotificationService.setAdminNotification(
        `Error in game.service.updateDrawResult, error: ${err}`,
        'executionError',
        'Execution Error in Game Service',
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
