import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, MoreThan, Repository } from 'typeorm';
import { Game } from './entities/game.entity';
import { DrawResult } from './entities/draw-result.entity';
import { BetOrder } from './entities/bet-order.entity';
import { Cron } from '@nestjs/schedule';
import { ethers } from 'ethers';
import { Core__factory, Helper__factory } from 'src/contract';
import { IHelper, ICore } from 'src/contract/Helper';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { ClaimDetail } from 'src/wallet/entities/claim-detail.entity';
import { CacheSettingService } from 'src/shared/services/cache-setting.service';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { MPC } from 'src/shared/mpc';
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
    @InjectRepository(UserWallet)
    private userWalletRepository: Repository<UserWallet>,
    @InjectRepository(ClaimDetail)
    private claimDetalRepository: Repository<ClaimDetail>,
    private adminNotificationService: AdminNotificationService,
    private cacheSettingService: CacheSettingService,
  ) {}

  // process of closing bet for current epoch, set draw result, and announce draw result
  // 1. GameService.setBetClose: scheduled at :00UTC, create new game, and also submit masked betOrder to Core contract
  // 2. Local script: cron at :01UTC create drawResult records and save directly into database
  // 3. GameGateway.emitDrawResult: scheduled at :02UTC, emit draw result to all connected clients
  // 4. follow by GameService.updateDrawResult: submit draw result to Core contract
  // 5. :05UTC, allow claim

  @Cron('0 0 */1 * * *', { utcOffset: 0 }) // every hour UTC time
  async setBetClose(): Promise<void> {
    try {
      // clear cache for handleLiveDrawResult() to return empty array
      this.cacheSettingService.clear();

      // set bet close in game record for current epoch
      const game = await this.gameRepository.findOne({
        where: { isClosed: false },
      });
      game.isClosed = true;
      await this.gameRepository.save(game);

      // create new game record for future
      const lastFutureGame = await this.gameRepository.findOne({
        // findOne() must provide where option
        where: { isClosed: false },
        order: { id: 'DESC' },
      });
      await this.gameRepository.save(
        this.gameRepository.create({
          epoch: (Number(lastFutureGame.epoch) + 1).toString(),
          maxBetAmount: Number(process.env.MAX_BET_AMOUNT),
          minBetAmount: Number(process.env.MIN_BET_AMOUNT),
          drawTxHash: null,
          drawTxStatus: null,
          // startDate & endDate: previous date + 1 hour
          startDate: new Date(lastFutureGame.startDate.getTime() + 3600000),
          endDate: new Date(lastFutureGame.endDate.getTime() + 3600000),
          isClosed: false,
        })
      )

      // submit masked betOrder on-chain
      const betOrders = await this.betOrderRepository.find({
        where: {
          gameId: game.id,
          isMasked: true,
        },
      });
      if (betOrders.length === 0) return; // no masked betOrder to submit

      const helperBot = new ethers.Wallet(
        await MPC.retrievePrivateKey(process.env.HELPER_BOT_ADDRESS),
        this.provider
      );
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
      const setDrawResultBot = new ethers.Wallet(
        await MPC.retrievePrivateKey(process.env.RESULT_BOT_ADDRESS),
        this.provider
      );
      const coreContract = Core__factory.connect(process.env.CORE_CONTRACT_ADDRESS, setDrawResultBot);
      const numberPairs = payload.map((result) => result.numberPair);
      const txResponse = await coreContract.setDrawResults(
        numberPairs,
        ethers.parseEther(process.env.MAX_BET_AMOUNT),
        '0x',
        { gasLimit: 1500000 }
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

  async getPastDrawResults(gameIds:number[]) {
    const games = [];
    for (const gameId of gameIds) {
      const game = await this.gameRepository.findOne({
        where: {
          id: gameId,
          isClosed: true,
          // game that just closed within 5 minutes won't be included
          endDate: LessThan(new Date(Date.now() - 18000)),
        },
        relations: {
          drawResult: true,
        },
      });

      if (!game) {
        // game is not closed yet, or just closed within 5 minutes
        games.push(null);
        continue;
      }

      game.drawResult = game.drawResult.map(result => (
        // to save payload
        {
          id: result.id,
          prizeCategory: result.prizeCategory,
          numberPair: result.numberPair,
          gameId: result.gameId,
        }
      )) as DrawResult[];
      games.push({
        // to save payload
        id: game.id,
        epoch: game.epoch,
        startDate: game.startDate,
        endDate: game.endDate,
        drawResult: game.drawResult,
      });
    }

    return { error: null, data: games };
  }

  async getAvailableGames() {
    const games = await this.gameRepository.findBy({ isClosed: false });

    return games.map(game => {
      // to save payload
      return {
        id: game.id,
        epoch: game.epoch,
        maxBetAmount: game.maxBetAmount,
        minBetAmount: game.minBetAmount,
        startDate: game.startDate,
        endDate: game.endDate,
      }
    })
  }

  async getLeaderboard(count: number) {
    // TODO: use better sql query

    // only betOrder that had claimed will be counted
    const claimDetails = await this.claimDetalRepository.find({
      relations: {
        walletTx: {
          userWallet: true,
        },
        betOrder: true,
      }
    })

    const maskValue = (value: string) => {
      const mask = value.slice(0, 3) + '****' + value.slice(value.length - 3)
      return mask
    }

    const allObj: { [key: string]: number } = {}
    for (const claimDetail of claimDetails) {
      const walletAddress = claimDetail.walletTx.userWallet.walletAddress;
      if (!allObj.hasOwnProperty(walletAddress)) allObj[walletAddress] = 0
      allObj[walletAddress] += Number(claimDetail.claimAmount)
    }
    let total = []
    for (const walletAddress in allObj) {
      const userWallet = await this.userWalletRepository.findOne({
        where: { walletAddress },
        relations: { user: true }
      });
      const winnerAccount = userWallet.user.uid;
      total.push({
        winnerAccount: maskValue(winnerAccount),
        walletAddress: maskValue(walletAddress),
        amount: allObj[walletAddress],
      })
    }
    total = total.sort((a, b) => b.amount - a.amount).slice(0, count)

    const currentDate = new Date()

    const dailyObj: { [key: string]: number } = {}
    for (const claimDetail of claimDetails) {
      if (claimDetail.betOrder.createdDate.getTime() > (currentDate.getTime() - (24*60*60*1000))) {
        const walletAddress = claimDetail.walletTx.userWallet.walletAddress
        if (!dailyObj.hasOwnProperty(walletAddress)) dailyObj[walletAddress] = 0
        dailyObj[walletAddress] += Number(claimDetail.claimAmount)
      }
    }
    let daily = []
    for (const walletAddress in dailyObj) {
      const userWallet = await this.userWalletRepository.findOne({
        where: { walletAddress },
        relations: { user: true }
      });
      const winnerAccount = userWallet.user.uid;
      daily.push({
        winnerAccount: maskValue(winnerAccount),
        walletAddress: maskValue(walletAddress),
        amount: dailyObj[walletAddress],
      })
    }
    daily = daily.sort((a, b) => b.amount - a.amount).slice(0, count)

    const weeklyObj: { [key: string]: number } = {}
    for (const claimDetail of claimDetails) {
      if (claimDetail.betOrder.createdDate.getTime() > (currentDate.getTime() - (7*24*60*60*1000))) {
        const walletAddress = claimDetail.walletTx.userWallet.walletAddress
        if (!weeklyObj.hasOwnProperty(walletAddress)) weeklyObj[walletAddress] = 0
        weeklyObj[walletAddress] += Number(claimDetail.claimAmount)
      }
    }
    let weekly = []
    for (const walletAddress in weeklyObj) {
      const userWallet = await this.userWalletRepository.findOne({
        where: { walletAddress },
        relations: { user: true }
      });
      const winnerAccount = userWallet.user.uid;
      weekly.push({
        winnerAccount: maskValue(winnerAccount),
        walletAddress: maskValue(walletAddress),
        amount: weeklyObj[walletAddress],
      })
    }
    weekly = weekly.sort((a, b) => b.amount - a.amount).slice(0, count)

    const monthlyObj: { [key: string]: number } = {}
    for (const claimDetail of claimDetails) {
      if (claimDetail.betOrder.createdDate.getTime() > (currentDate.getTime() - (30*24*60*60*1000))) {
        const walletAddress = claimDetail.walletTx.userWallet.walletAddress
        if (!monthlyObj.hasOwnProperty(walletAddress)) monthlyObj[walletAddress] = 0
        monthlyObj[walletAddress] += Number(claimDetail.claimAmount)
      }
    }
    let monthly = []
    for (const walletAddress in monthlyObj) {
      const userWallet = await this.userWalletRepository.findOne({
        where: { walletAddress },
        relations: { user: true }
      });
      const winnerAccount = userWallet.user.uid;
      monthly.push({
        winnerAccount: maskValue(winnerAccount),
        walletAddress: maskValue(walletAddress),
        amount: monthlyObj[walletAddress],
      })
    }
    monthly = monthly.sort((a, b) => b.amount - a.amount).slice(0, count)

    return {
      total,
      daily,
      weekly,
      monthly,
    }
  }

  async getPastResult(
    count?: number,
    startDate?: number,
    endDate?: number,
    numberPair?: string,
  ) {
    let drawResults;

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      const games = await this.gameRepository.find({
        where: { endDate: LessThan(end), startDate: MoreThan(start) },
        order: { id: 'DESC' },
      });

      drawResults = await this.drawResultRepository.find({
        where: { gameId: In(games.map((game) => game.id)) },
        order: { id: 'DESC' },
      });
    }

    if (numberPair) {
      drawResults = await this.drawResultRepository.find({
        where: { numberPair },
        order: { id: 'DESC' },
        take: count,
      });
    }

    return drawResults.map((result) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, prizeIndex, ...rest } = result;
      return rest;
    });
  }
}
