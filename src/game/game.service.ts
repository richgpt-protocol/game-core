import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, LessThan, MoreThan, Repository } from 'typeorm';
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
import { ConfigService } from 'src/config/config.service';
import { QueueService } from 'src/queue/queue.service';
import { Job } from 'bullmq';
import { QueueName, QueueType } from 'src/shared/enum/queue.enum';

interface SubmitDrawResultDTO {
  drawResults: DrawResult[];
  gameId: number;
}

@Injectable()
export class GameService implements OnModuleInit {
  provider = new ethers.JsonRpcProvider(
    this.configService.get(
      'PROVIDER_RPC_URL_' + this.configService.get('BASE_CHAIN_ID'),
    ),
  );

  constructor(
    @InjectRepository(Game)
    private gameRepository: Repository<Game>,
    @InjectRepository(DrawResult)
    private drawResultRepository: Repository<DrawResult>,
    @InjectRepository(UserWallet)
    private userWalletRepository: Repository<UserWallet>,
    @InjectRepository(ClaimDetail)
    private claimDetalRepository: Repository<ClaimDetail>,
    private adminNotificationService: AdminNotificationService,
    private cacheSettingService: CacheSettingService,
    private configService: ConfigService,
    private readonly queueService: QueueService,
    private dataSource: DataSource,
  ) {}

  // process of closing bet for current epoch, set draw result, and announce draw result
  // 1. GameService.setBetClose: scheduled at :00UTC, create new game, and also submit masked betOrder to Core contract
  // 2. Local script: cron at :01UTC create drawResult records and save directly into database
  // 3. GameGateway.emitDrawResult: scheduled at :02UTC, emit draw result to all connected clients
  // 4. follow by job GameService.submitDrawResult: submit draw result to Core contract
  // 5. :05UTC, allow claim

  onModuleInit() {
    this.queueService.registerHandler(
      QueueName.GAME,
      QueueType.SUBMIT_DRAW_RESULT,
      {
        jobHandler: this.submitDrawResult.bind(this),

        //Executed when onchain tx is failed for 5 times continously
        failureHandler: this.onChainTxFailed.bind(this),
      },
    );
  }

  @Cron('0 0 */1 * * *') // every hour
  async setBetClose(): Promise<void> {
    console.log('setBetClose()', new Date());
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // clear cache for handleLiveDrawResult() to return empty array
      this.cacheSettingService.clear();

      // set bet close in game record for current epoch
      const game = await queryRunner.manager
        .createQueryBuilder(Game, 'game')
        .where('game.isClosed = :isClosed', { isClosed: false })
        .getOne();
      game.isClosed = true;
      await queryRunner.manager.save(game);

      // create new game record for future
      const lastFutureGame = await queryRunner.manager
        .createQueryBuilder(Game, 'game')
        .where('game.isClosed = :isClosed', { isClosed: false })
        .orderBy('game.id', 'DESC')
        .getOne();
      await queryRunner.manager.save(
        queryRunner.manager.create(Game, {
          epoch: (Number(lastFutureGame.epoch) + 1).toString(),
          maxBetAmount: Number(this.configService.get('MAX_BET_AMOUNT')),
          minBetAmount: Number(this.configService.get('MIN_BET_AMOUNT')),
          drawTxHash: null,
          drawTxStatus: null,
          // startDate & endDate: previous date + 1 hour
          startDate: new Date(lastFutureGame.startDate.getTime() + 3600000),
          endDate: new Date(lastFutureGame.endDate.getTime() + 3600000),
          isClosed: false,
        }),
      );

      // submit masked betOrder on-chain
      const betOrders = await queryRunner.manager
        .createQueryBuilder(BetOrder, 'betOrder')
        .where('betOrder.gameId = :gameId', { gameId: game.id })
        .andWhere('betOrder.isMasked = :isMasked', { isMasked: true })
        .getMany();
      if (betOrders.length === 0) return; // no masked betOrder to submit

      const helperBot = new ethers.Wallet(
        await MPC.retrievePrivateKey(
          this.configService.get('HELPER_BOT_ADDRESS'),
        ),
        this.provider,
      );
      const helperContract = Helper__factory.connect(
        this.configService.get('HELPER_CONTRACT_ADDRESS'),
        helperBot,
      );
      // construct params for Helper.betLastMinutes()
      // [key: string] is userWalletAddress, one user might have multiple bets
      const userBets: { [key: string]: ICore.BetParamsStruct[] } = {};
      for (let i = 0; i < betOrders.length; i++) {
        const betOrder = betOrders[i];
        const walletTx = await queryRunner.manager
          .createQueryBuilder(WalletTx, 'walletTx')
          .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
          .where('walletTx.id = :id', { id: betOrder.walletTxId })
          .getOne();
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

      const walletTx = await queryRunner.manager
        .createQueryBuilder(WalletTx, 'walletTx')
        .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
        .leftJoinAndSelect('userWallet.user', 'user')
        .where('walletTx.id = :id', { id: betOrders[0].walletTxId })
        .getOne();
      const params: IHelper.BetLastMinuteParamsStruct[] = [];
      for (const userAddress in userBets) {
        params.push({
          uid: walletTx.userWallet.user.uid,
          ticketId: betOrders[0].walletTxId,
          user: userAddress,
          bets: userBets[userAddress],
        });
      }
      const estimatedGas =
        await helperContract.betLastMinutes.estimateGas(params);
      const txResponse = await helperContract.betLastMinutes(params, {
        // increase gasLimit by 30%
        gasLimit: (estimatedGas * ethers.toBigInt(13)) / ethers.toBigInt(10),
      });
      const txReceipt = await txResponse.wait();

      if (txReceipt.status === 1) {
        // tx success
        // update walletTx status & txHash for each betOrders
        for (const betOrder of betOrders) {
          const walletTx = await queryRunner.manager
            .createQueryBuilder(WalletTx, 'walletTx')
            .where('walletTx.id = :id', { id: betOrder.walletTxId })
            .getOne();
          walletTx.txHash = txReceipt.hash;
          walletTx.status = 'S';
          await queryRunner.manager.save(walletTx);
        }
        await queryRunner.commitTransaction();
      } else {
        // tx failed
        for (const betOrder of betOrders) {
          // only update txHash for each betOrders, status remain pending
          const walletTx = await queryRunner.manager
            .createQueryBuilder(WalletTx, 'walletTx')
            .where('walletTx.id = :id', { id: betOrder.walletTxId })
            .getOne();
          walletTx.txHash = txReceipt.hash;
          await queryRunner.manager.save(walletTx);
        }
        await queryRunner.commitTransaction();

        throw new Error(
          `betLastMinutes() on-chain transaction failed, txHash: ${txReceipt.hash}`,
        );
      }
    } catch (err) {
      // inform admin
      await this.adminNotificationService.setAdminNotification(
        `Error occur in game.service.setBetClose, error: ${err}`,
        'ExecutionError',
        'Execution Error in setBetClose()',
        true,
      );
    } finally {
      await queryRunner.release();
    }
  }

  async submitDrawResult(job: Job<SubmitDrawResultDTO>): Promise<void> {
    const { drawResults, gameId } = job.data;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // submit draw result to Core contract
      const setDrawResultBot = new ethers.Wallet(
        await MPC.retrievePrivateKey(
          this.configService.get('RESULT_BOT_ADDRESS'),
        ),
        this.provider,
      );
      const coreContract = Core__factory.connect(
        this.configService.get('CORE_CONTRACT_ADDRESS'),
        setDrawResultBot,
      );
      const numberPairs = drawResults.map((result) => result.numberPair);
      const estimatedGas = await coreContract.setDrawResults.estimateGas(
        numberPairs,
        ethers.parseEther(this.configService.get('MAX_BET_AMOUNT')),
        '0x',
      );
      const txResponse = await coreContract.setDrawResults(
        numberPairs,
        ethers.parseEther(this.configService.get('MAX_BET_AMOUNT')),
        '0x',
        {
          gasLimit:
            (estimatedGas * ethers.toBigInt(130)) / ethers.toBigInt(100),
        },
      );
      const txReceipt = await txResponse.wait();

      const game = await queryRunner.manager
        .createQueryBuilder(Game, 'game')
        .where('game.id = :id', { id: gameId })
        .getOne();
      if (txReceipt.status === 1) {
        // on-chain tx success
        // MUST NOT ERROR FROM HERE else setDrawResults() will be called again in next job
        game.drawTxStatus = 'S';
        game.drawTxHash = txReceipt.hash;
        await queryRunner.manager.save(game);

        // find betOrder that numberPair matched and update availableClaim to true
        for (const result of drawResults) {
          const betOrders = await queryRunner.manager
            .createQueryBuilder(BetOrder, 'betOrder')
            .where('betOrder.gameId = :gameId', { gameId })
            .andWhere('betOrder.numberPair = :numberPair', {
              numberPair: result.numberPair,
            })
            .getMany();
          // there might be more than 1 betOrder that numberPair matched
          for (const betOrder of betOrders) {
            betOrder.availableClaim = true;
            await queryRunner.manager.save(betOrder);
          }
        }
        await queryRunner.commitTransaction();
      } else {
        // on-chain tx failed
        game.drawTxStatus = 'P';
        await queryRunner.manager.save(game);
        await queryRunner.commitTransaction();
        throw new Error(
          `setDrawResults() on-chain transaction failed, txHash: ${txReceipt.hash}`,
        );
      }
    } catch (err) {
      console.error('Error in game.service.submitDrawResult:', err);

      // await this.adminNotificationService.setAdminNotification(
      //   `Error in game.service.submitDrawResult, error: ${err}`,
      //   'executionError',
      //   'Execution Error in submitDrawResult()',
      //   true,
      // );

      throw new Error(err);
    } finally {
      await queryRunner.release();
    }
  }

  async onChainTxFailed(job: Job, error: Error) {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      if (job.attemptsMade >= job.opts.attempts) {
        await queryRunner.connect();
        await queryRunner.startTransaction();

        const game = await queryRunner.manager.findOne(Game, {
          where: {
            id: job.data.gameId,
          },
        });
        game.drawTxStatus = 'F';
        await queryRunner.manager.save(game);
        await queryRunner.commitTransaction();
      }
    } catch (error) {
      console.error('Error in game.service.onChainTxFailed, error:', error);
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
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

  async getPastDrawResults(gameIds: number[]) {
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

      game.drawResult = game.drawResult.map((result) =>
        // to save payload
        ({
          id: result.id,
          prizeCategory: result.prizeCategory,
          numberPair: result.numberPair,
          gameId: result.gameId,
        }),
      ) as DrawResult[];
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

    return games.map((game) => {
      // to save payload
      return {
        id: game.id,
        epoch: game.epoch,
        maxBetAmount: game.maxBetAmount,
        minBetAmount: game.minBetAmount,
        startDate: game.startDate,
        endDate: game.endDate,
      };
    });
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
      },
    });

    const maskValue = (value: string) => {
      const mask = value.slice(0, 3) + '****' + value.slice(value.length - 3);
      return mask;
    };

    const allObj: { [key: string]: number } = {};
    for (const claimDetail of claimDetails) {
      const walletAddress = claimDetail.walletTx.userWallet.walletAddress;
      if (!allObj.hasOwnProperty(walletAddress)) allObj[walletAddress] = 0;
      allObj[walletAddress] += Number(claimDetail.claimAmount);
    }
    let total = [];
    for (const walletAddress in allObj) {
      const userWallet = await this.userWalletRepository.findOne({
        where: { walletAddress },
        relations: { user: true },
      });
      const winnerAccount = userWallet.user.uid;
      total.push({
        winnerAccount: maskValue(winnerAccount),
        walletAddress: maskValue(walletAddress),
        amount: allObj[walletAddress],
      });
    }
    total = total.sort((a, b) => b.amount - a.amount).slice(0, count);

    const currentDate = new Date();

    const dailyObj: { [key: string]: number } = {};
    for (const claimDetail of claimDetails) {
      if (
        claimDetail.betOrder.createdDate.getTime() >
        currentDate.getTime() - 24 * 60 * 60 * 1000
      ) {
        const walletAddress = claimDetail.walletTx.userWallet.walletAddress;
        if (!dailyObj.hasOwnProperty(walletAddress))
          dailyObj[walletAddress] = 0;
        dailyObj[walletAddress] += Number(claimDetail.claimAmount);
      }
    }
    let daily = [];
    for (const walletAddress in dailyObj) {
      const userWallet = await this.userWalletRepository.findOne({
        where: { walletAddress },
        relations: { user: true },
      });
      const winnerAccount = userWallet.user.uid;
      daily.push({
        winnerAccount: maskValue(winnerAccount),
        walletAddress: maskValue(walletAddress),
        amount: dailyObj[walletAddress],
      });
    }
    daily = daily.sort((a, b) => b.amount - a.amount).slice(0, count);

    const weeklyObj: { [key: string]: number } = {};
    for (const claimDetail of claimDetails) {
      if (
        claimDetail.betOrder.createdDate.getTime() >
        currentDate.getTime() - 7 * 24 * 60 * 60 * 1000
      ) {
        const walletAddress = claimDetail.walletTx.userWallet.walletAddress;
        if (!weeklyObj.hasOwnProperty(walletAddress))
          weeklyObj[walletAddress] = 0;
        weeklyObj[walletAddress] += Number(claimDetail.claimAmount);
      }
    }
    let weekly = [];
    for (const walletAddress in weeklyObj) {
      const userWallet = await this.userWalletRepository.findOne({
        where: { walletAddress },
        relations: { user: true },
      });
      const winnerAccount = userWallet.user.uid;
      weekly.push({
        winnerAccount: maskValue(winnerAccount),
        walletAddress: maskValue(walletAddress),
        amount: weeklyObj[walletAddress],
      });
    }
    weekly = weekly.sort((a, b) => b.amount - a.amount).slice(0, count);

    const monthlyObj: { [key: string]: number } = {};
    for (const claimDetail of claimDetails) {
      if (
        claimDetail.betOrder.createdDate.getTime() >
        currentDate.getTime() - 30 * 24 * 60 * 60 * 1000
      ) {
        const walletAddress = claimDetail.walletTx.userWallet.walletAddress;
        if (!monthlyObj.hasOwnProperty(walletAddress))
          monthlyObj[walletAddress] = 0;
        monthlyObj[walletAddress] += Number(claimDetail.claimAmount);
      }
    }
    let monthly = [];
    for (const walletAddress in monthlyObj) {
      const userWallet = await this.userWalletRepository.findOne({
        where: { walletAddress },
        relations: { user: true },
      });
      const winnerAccount = userWallet.user.uid;
      monthly.push({
        winnerAccount: maskValue(winnerAccount),
        walletAddress: maskValue(walletAddress),
        amount: monthlyObj[walletAddress],
      });
    }
    monthly = monthly.sort((a, b) => b.amount - a.amount).slice(0, count);

    return {
      total,
      daily,
      weekly,
      monthly,
    };
  }

  async getPastResult(
    count?: number,
    startDate?: string,
    endDate?: string,
    numberPair?: string,
  ) {
    let drawResults;

    if (startDate && endDate) {
      const start = new Date(Number(startDate));
      const end = new Date(Number(endDate));

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
