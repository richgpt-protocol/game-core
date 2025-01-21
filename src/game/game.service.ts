import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  Brackets,
  DataSource,
  In,
  LessThan,
  LessThanOrEqual,
  MoreThanOrEqual,
  QueryRunner,
  Repository,
} from 'typeorm';
import { Game } from './entities/game.entity';
import { DrawResult } from './entities/draw-result.entity';
import { BetOrder } from './entities/bet-order.entity';
import { Cron } from '@nestjs/schedule';
import { ethers } from 'ethers';
import {
  Core__factory,
  Deposit__factory,
  Helper__factory,
  Jackpot__factory,
} from 'src/contract';
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
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';
import { WalletService } from 'src/wallet/wallet.service';
import { PointService } from 'src/point/point.service';
import { ClaimService } from 'src/wallet/services/claim.service';
import { ReferralTx } from 'src/referral/entities/referral-tx.entity';
import { TxStatus } from 'src/shared/enum/status.enum';
import { ReferralTxType, WalletTxType } from 'src/shared/enum/txType.enum';
import { SettingEnum } from 'src/shared/enum/setting.enum';
import { Setting } from 'src/setting/entities/setting.entity';
import { projectName, endTime } from 'src/database/seeds/jackpot.seed';
import { Jackpot } from './entities/jackpot.entity';
import { FCMService } from 'src/shared/services/fcm.service';
import { AiResponseService } from 'src/shared/services/ai-response.service';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { BetService } from './bet.service';

@Injectable()
export class GameService implements OnModuleInit {
  private readonly logger = new Logger(GameService.name);
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
    private readonly walletService: WalletService,
    private readonly pointService: PointService,
    private readonly claimService: ClaimService,
    @InjectRepository(BetOrder)
    private betOrderRepository: Repository<BetOrder>,
    @InjectRepository(Setting)
    private settingRepository: Repository<Setting>,
    @InjectRepository(Jackpot)
    private jackpotRepository: Repository<Jackpot>,
    private fcmService: FCMService,
    private airesponseService: AiResponseService,
    private betService: BetService,
  ) {}

  // process of closing bet for current epoch, set draw result, announce draw result, set available claim and process referral bonus
  // 1. GameService.setBetClose: scheduled at :00UTC, create new game, and also submit masked betOrder to Core contract
  // 2. Local script: cron at :01UTC create drawResult records and save directly into database
  // 3. GameGateway.emitDrawResult: scheduled at :02UTC, emit draw result to all connected clients(UI)
  // 4. follow by GameService.submitDrawResult: submit draw result to Core contract
  // 5. follow by GameService.availableClaimAndProcessReferralBonus: set availableClaim for winning betOrder, and process referral bonus

  onModuleInit() {
    this.queueService.registerHandler(
      QueueName.REFERRAL_BONUS,
      QueueType.WINNING_REFERRAL_BONUS,
      {
        jobHandler: this.transferReferrerBonus.bind(this),
        failureHandler: this.onReferralBonusFailed.bind(this),
      },
    );

    const now = new Date(Date.now());
    const target = new Date(endTime);
    if (now < target) {
      const delay = target.getTime() - now.getTime();
      setTimeout(
        () => {
          this.setSquidGameJackpotHash();
        },
        // after drawSquidGameStage4 bot set jackpot hash into jackpot record
        // if this function read jackpot record too early, it won't get the jackpot hash from the record(and trigger fallback method)
        // tested 1 minute delay is not enough
        delay + 1000 * 60 * 5, // wait 5 minutes before set jackpot hash on-chain
      );
    }
  }

  @Cron('0 0 */1 * * *') // every hour
  async setBetClose(): Promise<void> {
    this.logger.log('setBetClose()');
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // clear cache for handleLiveDrawResult() to return empty array
      this.cacheSettingService.clear();

      // set bet close in game record for last hour epoch (add 10 seconds just in case)
      const lastHour = new Date(Date.now() - 60 * 60 * 1000 + 10 * 1000);
      const lastHourUTC = new Date(
        lastHour.getUTCFullYear(),
        lastHour.getUTCMonth(),
        lastHour.getUTCDate(),
        lastHour.getUTCHours(),
        lastHour.getUTCMinutes(),
        lastHour.getUTCSeconds(),
      );
      const game = await queryRunner.manager
        .createQueryBuilder(Game, 'game')
        .where('game.startDate < :lastHourUTC', { lastHourUTC })
        .andWhere('game.endDate > :lastHourUTC', { lastHourUTC })
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
        .leftJoinAndSelect('betOrder.gameUsdTx', 'gameUsdTx')
        .leftJoinAndSelect('betOrder.walletTx', 'walletTx')
        .leftJoinAndSelect('betOrder.creditWalletTx', 'creditWalletTx')
        .leftJoinAndSelect('walletTx.userWallet', 'walletTxUserWallet')
        .leftJoinAndSelect('creditWalletTx.userWallet', 'creditTxUserWallet')
        .leftJoinAndSelect('walletTxUserWallet.user', 'walletTxUser')
        .leftJoinAndSelect('creditTxUserWallet.user', 'creditTxUser')
        .where('betOrder.gameId = :gameId', { gameId: game.id })
        .andWhere('betOrder.isMasked = :isMasked', { isMasked: true })
        .andWhere('gameUsdTx.maskingTxHash IS NULL')
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
        // const walletTx = await queryRunner.manager
        //   .createQueryBuilder(WalletTx, 'walletTx')
        //   .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
        //   .where('walletTx.id = :id', { id: betOrder.walletTxId })
        //   .getOne();
        const wallet = betOrder.walletTx
          ? betOrder.walletTx.userWallet
          : betOrder.creditWalletTx.userWallet;

        const uid = betOrder.walletTx
          ? betOrder.walletTx.userWallet.user.uid
          : betOrder.creditWalletTx.userWallet.user.uid;
        const userIdentifier = `${wallet.walletAddress}-${betOrder.gameUsdTx.id}-${uid}`;
        if (!userBets[userIdentifier]) userBets[userIdentifier] = [];
        // big forecast & small forecast is treat as separate bet in contract
        const bigForecastAmount = Number(betOrder.bigForecastAmount);
        if (bigForecastAmount > 0) {
          userBets[userIdentifier].push({
            epoch: game.epoch,
            number: Number(betOrder.numberPair), // contract treat numberPair as uint256
            amount: ethers.parseEther(bigForecastAmount.toString()),
            forecast: 1, // big
          });
        }
        const smallForecastAmount = Number(betOrder.smallForecastAmount);
        if (smallForecastAmount > 0) {
          userBets[userIdentifier].push({
            epoch: game.epoch,
            number: Number(betOrder.numberPair), // contract treat numberPair as uint256
            amount: ethers.parseEther(smallForecastAmount.toString()),
            forecast: 0, // small
          });
        }
      }

      const params: IHelper.BetLastMinuteParamsStruct[] = [];
      for (const userIdentifier in userBets) {
        const [userAddress, gameUsdTxId, uid] = userIdentifier.split('-');
        params.push({
          uid: uid,
          ticketId: gameUsdTxId,
          user: userAddress,
          bets: userBets[userIdentifier],
        });
      }
      const estimatedGas =
        await helperContract.betLastMinutes.estimateGas(params);
      const txResponse = await helperContract.betLastMinutes(params, {
        // increase gasLimit by 30%
        gasLimit: (estimatedGas * ethers.toBigInt(13)) / ethers.toBigInt(10),
      });
      const txReceipt = await txResponse.wait();
      const referralQueueData = [];
      if (txReceipt.status === 1) {
        // tx success
        // update walletTx status & txHash for each betOrders
        for (const betOrder of betOrders) {
          // const walletTx = await queryRunner.manager
          //   .createQueryBuilder(WalletTx, 'walletTx')
          //   .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
          //   .leftJoinAndSelect('walletTx.gameUsdTx', 'gameUsdTx')
          //   .where('walletTx.id = :id', { id: betOrder.walletTxId })
          //   .getOne();
          // walletTx.txHash = txReceipt.hash;
          // walletTx.status = 'S';
          const walletTx = betOrder.walletTx;
          const userWallet = betOrder.walletTx
            ? betOrder.walletTx.userWallet
            : betOrder.creditWalletTx.userWallet;
          betOrder.gameUsdTx.maskingTxHash = txReceipt.hash;
          referralQueueData.push({
            userId: userWallet.userId,
            betAmount: walletTx ? Number(walletTx.txAmount) : 0,
            gameUsdTxId: betOrder.gameUsdTx.id,
            queueType: QueueType.BETTING_REFERRAL_DISTRIBUTION,
          });
          await queryRunner.manager.save(betOrder.gameUsdTx);

          // await queryRunner.manager.save(walletTx);
        }
        await queryRunner.commitTransaction();

        for (const data of referralQueueData) {
          const jobId = `handleBetReferral-${data.gameUsdTxId}`;
          await this.queueService.addJob(QueueName.BET, jobId, data);
        }

        // process jackpot
        // betOrders may created by multiple users for multiple times(i.e. permutation)
        const validBetOrdersByTxId: Record<string, BetOrder[]> = {};
        for (const betOrder of betOrders) {
          // betOrder without walletTx is not eligible for jackpot(only use credit to bet)
          if (!betOrder.walletTx) continue;

          const txId = betOrder.gameUsdTx.id;
          if (!validBetOrdersByTxId[txId]) {
            validBetOrdersByTxId[txId] = [];
          }
          validBetOrdersByTxId[txId].push(betOrder);
        }
        // convert into array
        const allValidBetOrders = Object.values(validBetOrdersByTxId);
        // loop through each group of betOrders(created within same gameUsdTx)
        for (const validBetOrders of allValidBetOrders) {
          if (validBetOrders.length === 0) continue; // just in case

          await this.betService.processJackpot(
            validBetOrders[0].walletTx.userWallet,
            validBetOrders[0].gameUsdTx,
            validBetOrders,
            queryRunner,
          );
        }
      } else {
        // tx failed
        for (const betOrder of betOrders) {
          // only update txHash for each betOrders
          // const walletTx = await queryRunner.manager
          //   .createQueryBuilder(WalletTx, 'walletTx')
          //   .where('walletTx.id = :id', { id: betOrder.walletTxId })
          //   .getOne();
          // walletTx.txHash = txReceipt.hash;
          betOrder.gameUsdTx.maskingTxHash = txReceipt.hash;
          await queryRunner.manager.save(betOrder.gameUsdTx);
        }
        await queryRunner.commitTransaction();

        throw new Error(
          `betLastMinutes() on-chain transaction failed, txHash: ${txReceipt.hash}`,
        );
      }
    } catch (err) {
      this.logger.error('Error in game.service.setBetClose:', err);
      // inform admin
      await this.adminNotificationService.setAdminNotification(
        `Error occur in game.service.setBetClose, error: ${err}`,
        'ExecutionError',
        'Execution Error in setBetClose()',
        true,
        true,
      );
    } finally {
      await queryRunner.release();
    }
  }

  async submitDrawResult(drawResults: Array<DrawResult>, gameId: number) {
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
      const winningNumberPairs = drawResults.map((result) => result.numberPair);
      const estimatedGas = await coreContract.setDrawResults.estimateGas(
        winningNumberPairs,
        ethers.parseEther(this.configService.get('MAX_BET_AMOUNT')),
        '0x',
      );
      const txResponse = await coreContract.setDrawResults(
        winningNumberPairs,
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
        game.drawTxStatus = TxStatus.SUCCESS;
        game.drawTxHash = txReceipt.hash;
        await queryRunner.manager.save(game);
        await queryRunner.commitTransaction();
      } else {
        // on-chain tx failed
        game.drawTxStatus = TxStatus.FAILED;
        await queryRunner.manager.save(game);
        await queryRunner.commitTransaction();
        throw new Error(
          `setDrawResults() on-chain transaction failed, txHash: ${txReceipt.hash}`,
        );
      }
    } catch (err) {
      console.log(err);
      this.logger.error('Error in game.service.submitDrawResult:', err);

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

  async setAvailableClaimAndProcessReferralBonus(
    drawResults: Array<DrawResult>,
    gameId: number,
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.startTransaction();
    try {
      const winners = new Set(drawResults.map((result) => result.numberPair));

      for (const drawResult of drawResults) {
        const betOrders = await queryRunner.manager
          .createQueryBuilder(BetOrder, 'betOrder')
          .leftJoinAndSelect('betOrder.walletTx', 'walletTx')
          .leftJoinAndSelect('betOrder.creditWalletTx', 'creditWalletTx')
          .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
          .leftJoinAndSelect('creditWalletTx.userWallet', 'creditUserWallet')
          .leftJoinAndSelect('userWallet.user', 'user')
          .leftJoinAndSelect('creditUserWallet.user', 'creditUser')
          .where('betOrder.gameId = :gameId', { gameId })
          .andWhere('betOrder.numberPair = :numberPair', {
            numberPair: drawResult.numberPair,
          })
          .andWhere(
            new Brackets((qb) => {
              qb.where('walletTx.status = :status', {
                status: TxStatus.SUCCESS,
              }).orWhere('creditWalletTx.status = :status', {
                status: TxStatus.SUCCESS,
              });
            }),
          )
          .getMany();
        // there might be more than 1 betOrder that numberPair matched

        this.logger.log('betOrders length: ' + betOrders.length);
        for (const betOrder of betOrders) {
          try {
            const { bigForecastWinAmount, smallForecastWinAmount } =
              this.claimService.calculateWinningAmount(betOrder, drawResult);
            const totalAmount =
              Number(bigForecastWinAmount) + Number(smallForecastWinAmount);
            if (totalAmount > 0) {
              betOrder.availableClaim = true;
              await queryRunner.manager.save(betOrder);

              const jobId = `processWinReferralBonus_${betOrder.id}`;
              await this.queueService.addJob(QueueName.REFERRAL_BONUS, jobId, {
                prizeAmount: totalAmount,
                betOrderId: betOrder.id,
                queueType: QueueType.WINNING_REFERRAL_BONUS,
              });
            } else {
              // totalAmount === 0 means, although the betOrder.numberPair matched the drawResult.numberPair,
              // but only betOrder.smallForecastAmount > 0 and smallForecastWinAmount
              // due to the drawResult.prizeCategory is not first, second or third
              // (special & consolation no reward for small forecast)
            }
          } catch (error) {
            this.logger.error('Error in processWinReferralBonus', error);
          }

          const user =
            betOrder.walletTx?.userWallet?.user ||
            betOrder.creditWalletTx?.userWallet?.user;
          if (!user) {
            continue;
          }

          this.logger.log('User ID: ' + user.id);

          const isWinner = winners.has(betOrder.numberPair);

          const title = isWinner ? '✨ You’re a Winner! ✨' : '📢 Game Results';
          const message = isWinner
            ? `✨ You’re a Winner! ✨\n\n🎉 Amazing! You’ve just won the game!\n\n**Game Epoch:** ${gameId}\n**Winning Number:** ${betOrder.numberPair}\n\n🍀 Luck is on your side—why not try your luck again?`
            : `🧧 Better Luck Next Time! 🧧\n\nThe results are in, but luck wasn’t on your side this time.\n\n**Game Epoch:** ${gameId}\n\n🎯 Take another shot—your lucky day could be just around the corner!`;

          await this.fcmService.sendUserFirebase_TelegramNotification(
            user.id,
            title,
            message,
          );

          this.logger.log(
            `Notification sent to user ID: ${user.id}, Status: ${isWinner ? 'WINNER' : 'LOSER'}`,
          );
        }
      }
      await queryRunner.commitTransaction();
    } catch (error) {
      console.log(error);
      this.logger.error(
        'Error in setAvailableClaimAndProcessReferralBonus',
        error,
      );
      // no rollbackTransaction() to prevent duplicate REFERRAL_BONUS queue added
      // await queryRunner.rollbackTransaction();
      throw error;
    }
    // queryRunner will be released by parent function
  }

  async reProcessReferralBonus(
    gameId: number,
    betOrderId: number,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.startTransaction();

      const drawResultForEpoch = await queryRunner.manager.find(DrawResult, {
        where: { gameId },
      });

      if (!drawResultForEpoch || drawResultForEpoch.length === 0) {
        throw new BadRequestException('DrawResult not found');
      }

      const winningNumberPairs = drawResultForEpoch.map(
        (result) => result.numberPair,
      );

      const betOrder = await queryRunner.manager.findOne(BetOrder, {
        where: {
          id: betOrderId,
          numberPair: In(winningNumberPairs),
          gameId,
        },
      });

      console.log('betOrder', betOrder);

      if (!betOrder) {
        throw new BadRequestException('Winning BetOrder not found');
      }

      await queryRunner.release();

      const drawResult = drawResultForEpoch.find(
        (result) => result.numberPair === betOrder.numberPair,
      );
      const { bigForecastWinAmount, smallForecastWinAmount } =
        this.claimService.calculateWinningAmount(betOrder, drawResult);
      const totalAmount =
        Number(bigForecastWinAmount) + Number(smallForecastWinAmount);
      const jobId = `processWinReferralBonus_${betOrder.id}`;
      await this.queueService.addJob(QueueName.REFERRAL_BONUS, jobId, {
        prizeAmount: totalAmount,
        betOrderId: betOrder.id,
        queueType: QueueType.WINNING_REFERRAL_BONUS,
        // delay: 2000,
      });

      return;
    } catch (error) {
      this.logger.error('Error in reProcessReferralBonus', error);
      if (error instanceof BadRequestException) {
        throw error;
      } else {
        throw new BadRequestException('Error in reProcessReferralBonus');
      }
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  async transferReferrerBonus(
    job: Job<{
      prizeAmount: number;
      betOrderId: number;
    }>,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const { prizeAmount, betOrderId } = job.data;
      if (prizeAmount === 0) return;

      const betOrder = await queryRunner.manager
        .createQueryBuilder(BetOrder, 'betOrder')
        .leftJoinAndSelect('betOrder.walletTx', 'walletTx')
        .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
        .leftJoinAndSelect('userWallet.user', 'user')
        .leftJoinAndSelect('user.referralUser', 'referralUser')
        .leftJoinAndSelect('referralUser.wallet', 'wallet')
        .where('betOrder.id = :betOrderId', { betOrderId })
        .getOne();

      if (!betOrder || !betOrder.walletTx || !betOrder.walletTx.userWallet) {
        return;
      }

      const referralUser = betOrder.walletTx.userWallet.user.referralUser;
      if (!referralUser) {
        return;
      }

      const level = this.walletService.calculateLevel(
        referralUser.wallet.pointBalance,
      );
      const bonusPerc =
        await this.pointService.getReferralPrizeBonusTier(level);
      if (!bonusPerc || bonusPerc === 0) {
        return;
      }
      const bonusAmount = prizeAmount * bonusPerc;

      // const lastValidWalletTx = await queryRunner.manager.findOne(WalletTx, {
      //   where: {
      //     userWalletId: referralUser.wallet.id,
      //     status: 'S',
      //   },
      //   order: { id: 'DESC' },
      // });

      const walletTx = new WalletTx();
      walletTx.txType = WalletTxType.REFERRAL;
      walletTx.txAmount = bonusAmount;
      walletTx.status = TxStatus.SUCCESS;
      walletTx.startingBalance = referralUser.wallet.walletBalance;
      walletTx.endingBalance =
        Number(walletTx.startingBalance) + Number(bonusAmount);
      walletTx.userWalletId = referralUser.wallet.id;
      await queryRunner.manager.save(walletTx);

      const chainId = this.configService.get('BASE_CHAIN_ID');
      const provider = new ethers.JsonRpcProvider(
        this.configService.get('PROVIDER_RPC_URL_' + chainId),
      );
      const signer = new ethers.Wallet(
        await MPC.retrievePrivateKey(
          this.configService.get('DISTRIBUTE_REFERRAL_FEE_BOT_ADDRESS'),
        ),
        provider,
      );
      const depositContract = Deposit__factory.connect(
        this.configService.get('DEPOSIT_CONTRACT_ADDRESS'),
        signer,
      );

      const onchainTx = await depositContract.distributeReferralFee(
        referralUser.wallet.walletAddress,
        ethers.parseEther(bonusAmount.toString()),
      );

      const receipt = await onchainTx.wait();

      // console.log('receipt', receipt);

      if (receipt.status !== 1) {
        throw new Error(
          `Error in transferReferrerBonus: onchain tx failed. txHash: ${onchainTx.hash}`,
        );
      }

      const gameUsdTx = new GameUsdTx();
      gameUsdTx.amount = bonusAmount;
      gameUsdTx.chainId = +chainId;
      gameUsdTx.status = TxStatus.SUCCESS;
      gameUsdTx.txHash = onchainTx.hash;
      gameUsdTx.senderAddress = process.env.DEPOSIT_BOT_ADDRESS;
      gameUsdTx.receiverAddress = referralUser.wallet.walletAddress;
      gameUsdTx.retryCount = 0;
      await queryRunner.manager.save(gameUsdTx);

      const referralTx = new ReferralTx();
      referralTx.rewardAmount = bonusAmount;
      referralTx.referralType = ReferralTxType.PRIZE;
      referralTx.txHash = onchainTx.hash;
      referralTx.status = TxStatus.SUCCESS;
      referralTx.userId = betOrder.walletTx.userWallet.user.id;
      referralTx.user = betOrder.walletTx.userWallet.user;
      referralTx.referralUserId = referralUser.id;
      referralTx.referralUser = referralUser;
      referralTx.walletTx = walletTx;
      await queryRunner.manager.save(referralTx);

      walletTx.txHash = onchainTx.hash;
      walletTx.gameUsdTx = gameUsdTx;
      walletTx.referralTx = referralTx;
      await queryRunner.manager.save(walletTx);

      referralUser.wallet.walletBalance =
        Number(referralUser.wallet.walletBalance) + bonusAmount;
      await queryRunner.manager.save(referralUser.wallet);

      gameUsdTx.walletTxId = walletTx.id;
      gameUsdTx.walletTxs = [walletTx];
      await queryRunner.manager.save(gameUsdTx);

      await queryRunner.commitTransaction();
    } catch (error) {
      this.logger.error('Error in transferReferrerBonus', error);
      await queryRunner.rollbackTransaction();

      throw error;
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  async onReferralBonusFailed(job: Job, error: Error) {
    if (job.attemptsMade >= job.opts.attempts) {
      try {
        const { betOrderId } = job.data;

        await this.adminNotificationService.setAdminNotification(
          `Failed to transfer referral bonus for betOrderId: ${betOrderId}. Error: ${error}`,
          'REFERRAL_BONUS_ERROR',
          'Referral Bonus Error',
          true,
        );
      } catch (error) {
        this.logger.error('Error in onReferralBonusFailed', error);
      }
    }
  }

  async onChainTxFailed(job: Job, error: Error) {
    this.logger.error('onChainTxFailed', error);
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
      this.logger.error('Error in game.service.onChainTxFailed, error:', error);
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

    const betOrdersWithAvailableClaim = await this.betOrderRepository
      .createQueryBuilder('betOrder')
      .leftJoinAndSelect('betOrder.walletTx', 'walletTx')
      .leftJoinAndSelect('betOrder.gameUsdTx', 'gameUsdTx')
      .leftJoinAndSelect('betOrder.creditWalletTx', 'creditWalletTx')
      .leftJoinAndSelect('walletTx.userWallet', 'walletTxUserWallet')
      .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
      .leftJoinAndSelect('creditWalletTx.userWallet', 'creditTxUserWallet')
      .leftJoinAndSelect('walletTxUserWallet.user', 'walletTxUser')
      .leftJoinAndSelect('creditTxUserWallet.user', 'creditTxUser')
      .where('betOrder.availableClaim = :availableClaim', {
        availableClaim: true,
      })
      .getMany();

    const maskValue = (value: string) => {
      const mask = value.slice(0, 3) + '****' + value.slice(value.length - 3);
      return mask;
    };

    const allObj: { [key: string]: number } = {};
    for (const betOrder of betOrdersWithAvailableClaim) {
      const walletAddress = betOrder.walletTx
        ? betOrder.walletTx.userWallet.walletAddress
        : betOrder.creditWalletTx.userWallet.walletAddress;
      if (!allObj.hasOwnProperty(walletAddress)) allObj[walletAddress] = 0;
      const drawResult = await this.drawResultRepository
        .createQueryBuilder('drawResult')
        .where('drawResult.gameId = :gameId', { gameId: betOrder.gameId })
        .andWhere('drawResult.numberPair = :numberPair', {
          numberPair: betOrder.numberPair,
        })
        .getOne();
      const winningAmount = this.claimService.calculateWinningAmount(
        betOrder,
        drawResult,
      );
      allObj[walletAddress] +=
        winningAmount.bigForecastWinAmount +
        winningAmount.smallForecastWinAmount;
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
    for (const betOrder of betOrdersWithAvailableClaim) {
      if (
        betOrder.createdDate.getTime() >
        currentDate.getTime() - 24 * 60 * 60 * 1000
      ) {
        const walletAddress = betOrder.walletTx
          ? betOrder.walletTx.userWallet.walletAddress
          : betOrder.creditWalletTx.userWallet.walletAddress;
        if (!dailyObj.hasOwnProperty(walletAddress))
          dailyObj[walletAddress] = 0;
        const drawResult = await this.drawResultRepository
          .createQueryBuilder('drawResult')
          .where('drawResult.gameId = :gameId', { gameId: betOrder.gameId })
          .andWhere('drawResult.numberPair = :numberPair', {
            numberPair: betOrder.numberPair,
          })
          .getOne();
        const winningAmount = this.claimService.calculateWinningAmount(
          betOrder,
          drawResult,
        );
        dailyObj[walletAddress] +=
          winningAmount.bigForecastWinAmount +
          winningAmount.smallForecastWinAmount;
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
    for (const betOrder of betOrdersWithAvailableClaim) {
      if (
        betOrder.createdDate.getTime() >
        currentDate.getTime() - 7 * 24 * 60 * 60 * 1000
      ) {
        const walletAddress = betOrder.walletTx
          ? betOrder.walletTx.userWallet.walletAddress
          : betOrder.creditWalletTx.userWallet.walletAddress;
        if (!weeklyObj.hasOwnProperty(walletAddress))
          weeklyObj[walletAddress] = 0;
        const drawResult = await this.drawResultRepository
          .createQueryBuilder('drawResult')
          .where('drawResult.gameId = :gameId', { gameId: betOrder.gameId })
          .andWhere('drawResult.numberPair = :numberPair', {
            numberPair: betOrder.numberPair,
          })
          .getOne();
        const winningAmount = this.claimService.calculateWinningAmount(
          betOrder,
          drawResult,
        );
        weeklyObj[walletAddress] +=
          winningAmount.bigForecastWinAmount +
          winningAmount.smallForecastWinAmount;
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
    for (const betOrder of betOrdersWithAvailableClaim) {
      if (
        betOrder.createdDate.getTime() >
        currentDate.getTime() - 30 * 24 * 60 * 60 * 1000
      ) {
        const walletAddress = betOrder.walletTx
          ? betOrder.walletTx.userWallet.walletAddress
          : betOrder.creditWalletTx.userWallet.walletAddress;
        if (!monthlyObj.hasOwnProperty(walletAddress))
          monthlyObj[walletAddress] = 0;
        const drawResult = await this.drawResultRepository
          .createQueryBuilder('drawResult')
          .where('drawResult.gameId = :gameId', { gameId: betOrder.gameId })
          .andWhere('drawResult.numberPair = :numberPair', {
            numberPair: betOrder.numberPair,
          })
          .getOne();
        const winningAmount = this.claimService.calculateWinningAmount(
          betOrder,
          drawResult,
        );
        monthlyObj[walletAddress] +=
          winningAmount.bigForecastWinAmount +
          winningAmount.smallForecastWinAmount;
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
        where: {
          endDate: Between(start, end),
        },
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

  async setFallbackDrawResults(gameId: number): Promise<Array<DrawResult>> {
    // generate 33 unique random numbers between 0 and 9999
    const winningNumbers: number[] = [];
    while (winningNumbers.length < 33) {
      let randomNumber: number;
      do {
        randomNumber = Math.floor(Math.random() * 10000);
      } while (winningNumbers.includes(randomNumber)); // generate another random number if already exists
      winningNumbers.push(randomNumber);
    }

    // convert winningNumbers to string(i.e. 1 to '0001')
    const winningNumberPairs = winningNumbers.map((number) => {
      let numberString = number.toString();
      if (numberString.length < 4) {
        numberString = '0'.repeat(4 - numberString.length) + numberString;
      }
      return numberString;
    });

    // create draw_result record and save into database
    const drawResult = this.drawResultRepository;
    for (let index = 0; index < winningNumberPairs.length; index++) {
      const numberPair = winningNumberPairs[index];
      await drawResult.save(
        drawResult.create({
          prizeCategory:
            index === 0
              ? '1' // first
              : index === 1
                ? '2' // second
                : index === 2
                  ? '3' // third
                  : index >= 3 && index <= 12
                    ? 'S' // special
                    : 'C', // consolation
          prizeIndex: index, // for smart contract
          numberPair: numberPair,
          gameId,
        }),
      );
    }

    return this.drawResultRepository.find({
      where: { gameId },
    });
  }

  async getCurrentGame(): Promise<Game> {
    const currentTime = new Date();

    const currentGame = await this.gameRepository.findOne({
      where: {
        startDate: LessThanOrEqual(currentTime),
        endDate: MoreThanOrEqual(currentTime),
        isClosed: false,
      },
    });

    if (!currentGame) {
      return await this.gameRepository.findOne({
        where: {
          isClosed: false,
        },
      });
    }

    return currentGame;
  }

  async getDrawResultByEpoch(epoch: string): Promise<DrawResult[]> {
    const game = await this.gameRepository.findOne({
      where: { epoch },
    });

    if (!game) {
      return [];
    }

    return this.drawResultRepository.find({
      where: { gameId: game.id },
    });
  }

  async getWinningAmountByEpoch(epoch: string): Promise<any> {
    const drawResults = await this.getDrawResultByEpoch(epoch);
    let total = 0;

    for (const drawResult of drawResults) {
      const betOrders = await this.betOrderRepository
        .createQueryBuilder('betOrder')
        .leftJoinAndSelect('betOrder.game', 'game')
        .where('game.epoch = :epoch', { epoch })
        .andWhere('betOrder.numberPair = :numberPair', {
          numberPair: drawResult.numberPair,
        })
        .getMany();

      for (const betOrder of betOrders) {
        const { bigForecastWinAmount, smallForecastWinAmount } =
          this.claimService.calculateWinningAmount(betOrder, drawResult);
        total += Number(bigForecastWinAmount) + Number(smallForecastWinAmount);
      }
    }

    return total;
  }

  @Cron('0 55 * * * *') // 5 minutes before every hour
  async pushBettingStatistic(): Promise<void> {
    // get current epoch
    const now = new Date();
    const utcNow = new Date(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
    );
    const game = await this.gameRepository
      .createQueryBuilder('game')
      .where('game.startDate < :utcNow', { utcNow })
      .orderBy('game.startDate', 'DESC')
      .getOne();
    if (!game) {
      this.logger.error('No game found for current epoch');
      return;
    }

    // get bot account user ids
    const setting = await this.settingRepository
      .createQueryBuilder('setting')
      .where('setting.key = :key', { key: SettingEnum.BOT_ACCOUNT_USER_IDS })
      .getOne();
    if (!setting) {
      this.logger.error('No setting found for bot account user ids');
      return;
    }
    const botAccountUserIds = JSON.parse(setting.value);

    // get user that won before
    const availableClaimBetOrders = await this.betOrderRepository
      .createQueryBuilder('betOrder')
      .leftJoinAndSelect('betOrder.walletTx', 'walletTx')
      .leftJoinAndSelect('betOrder.creditWalletTx', 'creditWalletTx')
      .where('betOrder.availableClaim = :availableClaim', {
        availableClaim: true,
      })
      .getMany();
    const winUserWalletIds = availableClaimBetOrders.map((betOrder) =>
      betOrder.walletTx
        ? betOrder.walletTx.userWalletId
        : betOrder.creditWalletTx.walletId,
    );

    let query = this.betOrderRepository
      .createQueryBuilder('betOrder')
      .leftJoinAndSelect('betOrder.walletTx', 'walletTx')
      .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
      .leftJoinAndSelect('userWallet.user', 'user')
      .where('betOrder.gameId = :gameId', { gameId: game.id })
      // filter out not real USDT bet
      .andWhere('betOrder.walletTxId IS NOT NULL')
      // filter out not $1 big forecast at max
      .andWhere('betOrder.bigForecastAmount > 0')
      .andWhere('betOrder.bigForecastAmount <= 1');
    if (botAccountUserIds?.length > 0) {
      // filter out bot account
      query = query.andWhere('user.id NOT IN (:...botAccountUserIds)', {
        botAccountUserIds,
      });
    }
    if (winUserWalletIds?.length > 0) {
      // filter out user that won before
      query = query.andWhere('userWallet.id NOT IN (:...winUserWalletIds)', {
        winUserWalletIds,
      });
    }
    const betOrders = await query.getMany();

    if (betOrders.length === 0) {
      this.logger.log(
        `pushBettingStatictic(): No bet orders found/criteria met for current epoch - ${game.epoch}`,
      );
      return;
    }

    const userBetDetail = {};
    for (const betOrder of betOrders) {
      const userWalletId = betOrder.walletTx.userWalletId;
      const user = betOrder.walletTx.userWallet.user;
      const numberPair = betOrder.numberPair;

      if (!userBetDetail[userWalletId]) {
        userBetDetail[userWalletId] = {
          // to include the user's telegram username and phone number
          tgUsername: user.tgUsername || null,
          phoneNumber: user.phoneNumber || null,
          bets: {},
        };
      }

      if (!userBetDetail[userWalletId].bets[numberPair]) {
        userBetDetail[userWalletId].bets[numberPair] = {
          big: 0,
          small: 0,
        };
      }

      userBetDetail[userWalletId].bets[numberPair].big += Number(
        betOrder.bigForecastAmount,
      );
      userBetDetail[userWalletId].bets[numberPair].small += Number(
        betOrder.smallForecastAmount,
      );
    }

    let formattedContent = '';
    for (const userWalletId in userBetDetail) {
      const user = userBetDetail[userWalletId];
      formattedContent += `Telegram Username: ${user.tgUsername || 'N/A'}, Phone Number: ${user.phoneNumber || 'N/A'}\n`;
      formattedContent += '| Number | Big | Small |\n';
      formattedContent += '|---------|-----|------|\n';

      for (const numberPair in user.bets) {
        const bet = user.bets[numberPair];
        formattedContent += `| ${numberPair}      | ${bet.big.toFixed(2)} | ${bet.small.toFixed(2)} |\n`;
      }
      formattedContent += '\n';
    }

    this.adminNotificationService.setAdminNotification(
      `Current epoch: ${game.epoch}\n\n${formattedContent}`,
      'BETTING_STATISTIC',
      'Betting Statistic For Current Epoch',
      true,
      true,
    );
  }

  async setSquidGameJackpotHash(): Promise<void> {
    const jackpot = await this.jackpotRepository
      .createQueryBuilder('jackpot')
      .where('jackpot.projectName = :projectName', { projectName })
      .getOne();
    if (!jackpot) {
      this.logger.error(`Jackpot record for ${projectName} not found`);
      return;
    }

    const jackpotContractOwner = new ethers.Wallet(
      await MPC.retrievePrivateKey(
        this.configService.get('JACKPOT_CONTRACT_OWNER_ADDRESS'),
      ),
      this.provider,
    );
    const jackpotContract = Jackpot__factory.connect(
      this.configService.get('JACKPOT_CONTRACT_ADDRESS'),
      jackpotContractOwner,
    );

    if (!jackpot.jackpotHash) {
      // something wrong with drawSquidGameStage4 bot
      // fallback to set jackpot hash randomly
      this.logger.error(`Jackpot hash for ${projectName} not set`);

      const txResponse = await jackpotContract.drawJackpotHash(projectName);
      const txReceipt = await txResponse.wait();
      jackpot.jackpotHash = txReceipt.hash;
      await this.jackpotRepository.save(jackpot);
    }

    let retryCount = 0;
    while (retryCount < 5) {
      try {
        const txResponse = await jackpotContract.setJackpotHash(
          projectName,
          jackpot.jackpotHash,
        );
        const txReceipt = await txResponse.wait();
        if (!txReceipt) throw new Error('txReceipt is null');
        if (txReceipt.status !== 1)
          throw new Error('txReceipt status is not 1(tx failed)');

        jackpot.status = TxStatus.SUCCESS;
        jackpot.txHash = txReceipt.hash;
        await this.jackpotRepository.save(jackpot);

        break;
      } catch (error) {
        retryCount++;
        this.logger.error(`Failed to set jackpot hash: ${error}`);
      }
    }

    if (retryCount === 5) {
      this.logger.error(`Failed to set jackpot hash after 5 retries`);
      jackpot.status = TxStatus.FAILED;
      await this.jackpotRepository.save(jackpot);

      await this.adminNotificationService.setAdminNotification(
        `Error occur in game.service.setSquidGameJackpotHash`,
        'SetJackpotHashFailed',
        'Error Occurred When Try to Set Jackpot Hash On-chain for Squid Game Stage 4',
        true,
        true,
      );
    }
  }

  @Cron('58 * * * *')
  async notifyUsersBeforeResult(): Promise<void> {
    this.logger.log('notifyUsersBeforeResult started');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const currentGame = await queryRunner.manager
        .createQueryBuilder(Game, 'game')
        .where('game.isClosed = :isClosed', { isClosed: false })
        .orderBy('game.startDate', 'DESC')
        .getOne();

      this.logger.log(`Current game: ${currentGame?.epoch}`);

      if (!currentGame) {
        this.logger.warn('No active game found');
        return;
      }

      const betOrders = await queryRunner.manager
        .createQueryBuilder(BetOrder, 'betOrder')
        .leftJoinAndSelect('betOrder.walletTx', 'walletTx')
        .leftJoinAndSelect('betOrder.creditWalletTx', 'creditWalletTx')
        .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
        .leftJoinAndSelect('creditWalletTx.userWallet', 'creditUserWallet')
        .leftJoinAndSelect('userWallet.user', 'user')
        .leftJoinAndSelect('creditUserWallet.user', 'creditUser')
        .where('betOrder.gameId = :gameId', { gameId: currentGame.id })
        .getMany();

      this.logger.log(`Number of bet orders: ${betOrders.length}`);

      for (const betOrder of betOrders) {
        const user =
          betOrder.walletTx?.userWallet?.user ||
          betOrder.creditWalletTx?.userWallet?.user;

        this.logger.log(`User ID: ${user.id}`);
        const message = `Only 1 minute left until the results are announced! ⏳ Check it out now and see if you're a winner! 🏆`;
        await this.fcmService.sendUserFirebase_TelegramNotification(
          user.id,
          'Result Announcement Reminder 🕒',
          message,
        );
        this.logger.log(`Notification sent to user ID: ${user.id}`);
      }
    } catch (error) {
      this.logger.error('Error in notifyUsersBeforeResult:', error.message);
    } finally {
      await queryRunner.release();
    }
  }

  @Cron('0 0 0 * * *')
  async notifyUsersWithoutBet(): Promise<void> {
    this.logger.log('notifyUsersWithoutBet started');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      this.logger.log(`Three days ago: ${threeDaysAgo}`);

      const usersWithBalance = await queryRunner.manager
        .createQueryBuilder(UserWallet, 'userWallet')
        .leftJoinAndSelect('userWallet.user', 'user')
        .getMany();

      this.logger.log(
        `Number of users with balance: ${usersWithBalance.length}`,
      );

      const aiMessage =
        await this.airesponseService.generateInactiveUserNotification();
      const usersToNotify = [];

      this.logger.log(`AI message: ${aiMessage}`);

      for (const userWallet of usersWithBalance) {
        const recentPointTx = await queryRunner.manager
          .createQueryBuilder(PointTx, 'pointTx')
          .where('pointTx.walletId = :walletId', { walletId: userWallet.id })
          .andWhere('pointTx.createDate > :threeDaysAgo', { threeDaysAgo })
          .andWhere('pointTx.status = :status', { status: 'S' })
          .getOne();

        if (!recentPointTx) {
          usersToNotify.push(userWallet.user.id);
        }
      }

      this.logger.log(`Number of users to notify: ${usersToNotify.length}`);

      for (const userId of usersToNotify) {
        await this.fcmService.sendUserFirebase_TelegramNotification(
          userId,
          'Bet Reminder 🕹️',
          aiMessage,
        );
        await this.airesponseService.saveAiMessageToChatLog(userId, aiMessage);
        this.logger.log(`Notification sent to user ID: ${userId}`);
      }
    } catch (error) {
      this.logger.error('Error in notifyUsersWithoutBet:', error.message);
    } finally {
      await queryRunner.release();
    }
  }
}
