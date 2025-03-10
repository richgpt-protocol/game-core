/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner, Not, Brackets } from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { BetDto, EstimateBetResponseDTO } from 'src/game/dto/Bet.dto';
import { Game } from './entities/game.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { BetOrder } from './entities/bet-order.entity';
import { ConfigService } from 'src/config/config.service';
import {
  JsonRpcProvider,
  MaxUint256,
  Wallet,
  ethers,
  parseUnits,
} from 'ethers';
import {
  Core__factory,
  Deposit__factory,
  GameUSD__factory,
  Jackpot__factory,
} from 'src/contract';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { CreditWalletTx } from 'src/wallet/entities/credit-wallet-tx.entity';
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';
import { ReferralTx } from 'src/referral/entities/referral-tx.entity';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { PointService } from 'src/point/point.service';
import { UserService } from 'src/user/user.service';
import { ReloadTx } from 'src/wallet/entities/reload-tx.entity';
import { MPC } from 'src/shared/mpc';
import { QueueService } from 'src/queue/queue.service';
import { Job } from 'bullmq';
import { QueueName, QueueType } from 'src/shared/enum/queue.enum';
import { ReferralTxStatus, TxStatus } from 'src/shared/enum/status.enum';
import {
  CreditWalletTxType,
  ReferralTxType,
  WalletTxType,
} from 'src/shared/enum/txType.enum';
import { randomUUID } from 'crypto';
import { PointTxType } from 'src/shared/enum/txType.enum';
import { Setting } from 'src/setting/entities/setting.entity';
import { SettingEnum } from 'src/shared/enum/setting.enum';
import { JackpotTx } from './entities/jackpot-tx.entity';
import { Jackpot } from './entities/jackpot.entity';
import { SquidGameParticipant } from 'src/campaign/entities/squidGame.participant.entity';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { I18nService } from 'nestjs-i18n';

interface SubmitBetJobDTO {
  userWalletId: number;
  gameUsdTxId: number;
}

interface HandleReferralFlowDTO {
  userId: number;
  betAmount: number;
  gameUsdTxId: number;
}

interface ParticipateJackpotDTO {
  walletAddress: string;
  uid: string;
  ticketId: number;
  feeTokenAddress: string;
  feeAmount: string;
  jackpotId: number;
  jackpotTxId: number;
  queueType: QueueType;
}

@Injectable()
export class BetService implements OnModuleInit {
  private readonly logger = new Logger(BetService.name);
  private readonly MAX_NUMBER_OF_DRAWS = 168;

  constructor(
    // @InjectRepository(Game)
    // private gameRepository: Repository<Game>,
    @InjectRepository(BetOrder)
    private betRepository: Repository<BetOrder>,
    @InjectRepository(GameUsdTx)
    private gameUsdTxRepository: Repository<GameUsdTx>,
    @InjectRepository(ReloadTx)
    private reloadTxRepository: Repository<ReloadTx>,
    private configService: ConfigService,
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
    private readonly pointService: PointService,
    private readonly userService: UserService,
    private readonly queueService: QueueService,
    @InjectRepository(JackpotTx)
    private jackpotTxRepository: Repository<JackpotTx>,
    private readonly adminNotificationService: AdminNotificationService,
    private i18n: I18nService,
  ) {}
  onModuleInit() {
    // Executed when distributing referral rewards for betting
    this.queueService.registerHandler(
      QueueName.BET,
      QueueType.BETTING_REFERRAL_DISTRIBUTION,
      {
        jobHandler: this.handleReferralFlow.bind(this),
        failureHandler: this.onReferralFailed.bind(this),
      },
    );
  }

  maskingIntervalInSeconds = 120 * 1000; //120 seconds before endTime of currentEpoch after which masking will start

  private referralCommissionByRank = (rank: number) => {
    switch (rank) {
      case 1:
        return 0.1;
      case 2:
        return 0.15;
      case 3:
        return 0.2;
      default:
        throw new Error('Invalid rank');
    }
  };

  async getBets(
    userId: number,
    startEpoch?: number,
    page: number = 1,
    pageSize: number = 10,
  ) {
    try {
      const bets = await this.betRepository
        .createQueryBuilder('bet')
        .leftJoinAndSelect('bet.game', 'game')
        .leftJoinAndSelect('bet.creditWalletTx', 'creditWalletTx')
        .leftJoinAndSelect('creditWalletTx.userWallet', 'userWallet')
        .leftJoinAndSelect('bet.gameUsdTx', 'gameUsdTx')
        .leftJoinAndSelect('gameUsdTx.walletTxs', 'walletTx')
        .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
        .where('userWallet.userId = :userId', { userId })
        .andWhere('game.epoch >= :startEpoch', { startEpoch: startEpoch || 0 })
        .skip((page - 1) * pageSize)
        .take(pageSize)
        .getMany();

      return bets;
    } catch (error) {
      this.logger.error(error);
      throw new BadRequestException('Error in getBets');
    }
  }

  async getRecentBets(count: number = 50) {
    try {
      const gameUsdTxs = await this.gameUsdTxRepository
        .createQueryBuilder('gameUsdTx')
        .innerJoinAndSelect('gameUsdTx.betOrders', 'betOrder')
        .leftJoinAndSelect('gameUsdTx.walletTxs', 'walletTx')
        .leftJoinAndSelect('walletTx.userWallet', 'walletUserWallet')
        .leftJoinAndSelect('gameUsdTx.creditWalletTx', 'creditWalletTx')
        .leftJoinAndSelect('creditWalletTx.userWallet', 'creditUserWallet')
        .leftJoinAndSelect('walletUserWallet.user', 'walletUser')
        .leftJoinAndSelect('creditUserWallet.user', 'creditUser')
        .where('gameUsdTx.status = :status', { status: TxStatus.SUCCESS })
        .andWhere(
          new Brackets((qb) => {
            qb.where('walletTx.txType = :txType', {
              txType: WalletTxType.PLAY,
            }).orWhere('creditWalletTx.txType = :txType', {
              txType: CreditWalletTxType.PLAY,
            });
          }),
        )
        .limit(count)
        .orderBy('betOrder.createdDate', 'DESC')
        .getMany();

      if (gameUsdTxs.length === 0) return [];

      const bets = gameUsdTxs.map((bet) => {
        let uid;
        if (bet.walletTxs.length > 0) {
          uid = bet.walletTxs[0].userWallet.user.uid;
        } else if (bet.creditWalletTx.length > 0) {
          uid = bet.creditWalletTx[0].userWallet.user.uid;
        }

        const maskedUID = uid.slice(0, 3) + '****' + uid.slice(uid.length - 3);
        return {
          user: maskedUID,
          amount: parseFloat(Number(bet.amount).toFixed(2)),
          txHash: bet.txHash,
          url:
            this.configService.get('EXPLORER_BASE_URL') + '/tx/' + bet.txHash,
          createdDate: bet.betOrders[0].createdDate,
        };
      });

      return bets;
    } catch (error) {
      this.logger.error(error);
      throw new BadRequestException('Error getting recent bets');
    }
  }

  async estimateBetAmount(payload: BetDto[]): Promise<EstimateBetResponseDTO> {
    try {
      let totalAmount = 0;

      payload = this._formatBets(payload);
      const groupedAmount = payload.map((bet, index) => {
        const numberPairs = new Set();
        numberPairs.add(bet.numberPair);
        if (bet.isPermutation) {
          const numberPairsGenerated = this._generatePermutations(
            bet.numberPair,
          );
          numberPairsGenerated.forEach((numberPair) =>
            numberPairs.add(numberPair),
          );
        }

        const bettingAmount =
          (bet.bigForecastAmount + bet.smallForecastAmount) *
          bet.numberOfDraws *
          numberPairs.size;

        totalAmount += bettingAmount;

        return {
          id: index,
          numberPairs: bet.numberPair,
          calculatedAmount: bettingAmount,
          numberSize: numberPairs.size,
          allNumberPairs: Array.from(numberPairs),
        };
      });

      return {
        groupedAmount,
        totalAmount,
      };
    } catch (error) {
      this.logger.error(error);
      throw new BadRequestException('Error in estimateBetAmount');
    }
  }

  /**
   * 1. Validates the walletBalance, creditBalance, betAmount, epoch etc and creates the db entries.
   * 2. If one of the bet order falls within the masking interval, then the txHash isMasking is set to true.
   * 3. The betOrders are added to the submitBet() queue.
   * 4. The submitBet() method runs inside the queue. If the betOrders contains no masked bets, onchain transaction is send and the txHash is updated.
   * 5. If the betOrders contains only masked bets, then the txHash is set to a random UUID and the status is set to SUCCESS immediately (without sending onchainTx).
   * 6. If the betOrders contains both masked and unmasked bets, then the onchain transaction is sent for the unmasked bets and the onchain txHash is set.
   * 7. The masked bets are processed in the next queue job in handleTxSuccess() method.
   * 8. The handleTxSuccess() method updates the walletBalance, creditBalance etc and marks the status as SUCCESS. If the gameUSDTx contains masked bets, then the referral rewards are not processed at this time.
   * 9. If there are no masked bets, The referral rewards are processed in the next queue job in handleReferralFlow() method.
   * 10. Incase there are masked bets, It will be processed by setBetClose() cron in gameservice. Once the onchain tx is successful(betLastMinutes()), the masked bets are processed in handleReferralFlow() job.
   */
  async bet(userId: number, payload: BetDto[]): Promise<any> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const userInfo = await queryRunner.manager
        .createQueryBuilder(User, 'user')
        .leftJoinAndSelect('user.wallet', 'wallet')
        .where('user.id = :userId', { userId })
        .getOne();

      payload = this._formatBets(payload);
      await this.validateBets(payload, queryRunner);

      const pendingWalletTxAmountResult = await queryRunner.manager.query(
        `SELECT SUM(txAmount) as pendingAmount FROM wallet_tx
          WHERE
            userWalletId = ${userInfo.wallet.id} AND
            txType IN ('REDEEM', 'PLAY', 'INTERNAL_TRANSFER') AND
            status IN ('P', 'PD', 'PA')`,
      );
      const pendingWalletTxAmount =
        Number(pendingWalletTxAmountResult[0]?.pendingAmount) || 0;
      const actualWalletBalance =
        pendingWalletTxAmount >= userInfo.wallet.walletBalance
          ? 0
          : userInfo.wallet.walletBalance - pendingWalletTxAmount;

      const pendingCreditWalletTxAmountResult = await queryRunner.manager.query(
        `SELECT SUM(amount) as pendingAmount FROM credit_wallet_tx
              WHERE
                userWalletId = ${userInfo.wallet.id} AND
                txType IN ('PLAY', 'EXPIRY') AND
                status IN ('P')`,
      );
      const pendingCreditWalletTxAmount =
        Number(pendingCreditWalletTxAmountResult[0]?.pendingAmount) || 0;
      const actualCreditBalance =
        pendingCreditWalletTxAmount >= userInfo.wallet.creditBalance
          ? 0
          : userInfo.wallet.creditBalance - pendingCreditWalletTxAmount;

      // eslint-disable-next-line prefer-const
      let { betOrders, totalWalletBalanceUsed, creditWalletTxns, totalAmount } =
        await this.createBetOrders(
          actualWalletBalance,
          actualCreditBalance,
          userInfo,
          payload,
          queryRunner,
        );

      const gameUsdTx = new GameUsdTx();
      gameUsdTx.amount = totalAmount;
      gameUsdTx.status = TxStatus.PENDING;
      gameUsdTx.senderAddress = userInfo.wallet.walletAddress;
      gameUsdTx.receiverAddress = this.configService.get(
        'GAMEUSD_POOL_CONTRACT_ADDRESS',
      );
      gameUsdTx.chainId = +this.configService.get('BASE_CHAIN_ID');
      gameUsdTx.retryCount = 0;
      const gameUsdResult = await queryRunner.manager.save(gameUsdTx);

      let walletTx: WalletTx;
      if (totalWalletBalanceUsed > 0) {
        if (totalWalletBalanceUsed > actualWalletBalance) {
          throw new BadRequestException('bet.INSUFFICIENT_BALANCE');
        }

        // Create wallet tx
        walletTx = new WalletTx();
        walletTx.txType = WalletTxType.PLAY;
        walletTx.status = TxStatus.PENDING;
        walletTx.userWalletId = userInfo.wallet.id;
        walletTx.userWallet = userInfo.wallet;
        walletTx.txAmount = totalWalletBalanceUsed;
        walletTx.gameUsdTx = gameUsdResult;

        await queryRunner.manager.save(walletTx);

        await queryRunner.manager.update(GameUsdTx, gameUsdResult.id, {
          walletTxId: walletTx.id,
        });
      }

      if (creditWalletTxns.length > 0) {
        creditWalletTxns = creditWalletTxns.map((tx) => {
          tx.gameUsdTx = gameUsdResult;
          return tx;
        });
        await queryRunner.manager.save(creditWalletTxns);
        gameUsdResult.creditWalletTx = creditWalletTxns;
        await queryRunner.manager.save(gameUsdResult);
      }

      // console.log('bet - creditWalletTxns', creditWalletTxns);
      betOrders = betOrders.map((bet) => {
        if (totalWalletBalanceUsed > 0) {
          bet.walletTx = walletTx;
        }
        bet.gameUsdTx = gameUsdResult;
        return bet;
      });

      await queryRunner.manager.save(betOrders);
      await queryRunner.commitTransaction();

      // Used for earlier check and top up for next transaction
      this.eventEmitter.emit(
        'gas.service.reload',
        userInfo.wallet.walletAddress,
        gameUsdTx.chainId,
      );

      const jobId = `placeBet-${gameUsdTx.id}`;
      await this.queueService.addDynamicQueueJob(
        `${QueueName.BET}_${userInfo.wallet.walletAddress}`,
        jobId,
        {
          jobHandler: this.submitBet.bind(this),
          failureHandler: this.onOnchainTxFailed.bind(this),
        },
        {
          userWalletId: userInfo.wallet.id,
          gameUsdTxId: gameUsdTx.id,
          queueType: QueueType.SUBMIT_BET,
        },
        0, // no delay
      );
    } catch (error) {
      this.logger.error(`Rolling back Db transaction`);
      this.logger.error(error);
      await queryRunner.rollbackTransaction();

      if (error instanceof BadRequestException) {
        throw new BadRequestException(error.message);
      } else {
        throw new BadRequestException('Error in bet');
      }
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  async restartBet(gameTxId: number, userId: number): Promise<boolean> {
    try {
      // const gameUsdTx = await this.gameUsdTxRepository.findOne({
      //   where: {
      //     id: gameTxId,
      //     status: Not(TxStatus.SUCCESS),
      //   },
      //   relations: ['walletTxs', 'walletTxs.betOrders'],
      // });
      const gameUsdTx = await this.gameUsdTxRepository
        .createQueryBuilder('gameUsdTx')
        .leftJoinAndSelect('gameUsdTx.walletTxs', 'walletTxs')
        .leftJoinAndSelect('walletTxs.betOrders', 'betOrders')
        .where('gameUsdTx.id = :id', { id: gameTxId })
        .andWhere('gameUsdTx.status != :status', { status: TxStatus.SUCCESS })
        .getOne();

      if (!gameUsdTx) {
        throw new BadRequestException('Invalid gameTxId');
      }

      const userInfo = await this.userService.getUserInfo(userId);

      const jobId = `placeBet-${gameUsdTx.id}`;
      await this.queueService.addDynamicQueueJob(
        `${QueueName.BET}_${userInfo.wallet.walletAddress}`,
        jobId,
        {
          jobHandler: this.submitBet.bind(this),
          failureHandler: this.onOnchainTxFailed.bind(this),
        },
        {
          userWalletId: userInfo.wallet.id,
          gameUsdTxId: gameUsdTx.id,
          queueType: QueueType.SUBMIT_BET,
        },
        0, // no delay
      );

      return true;
    } catch (error) {
      this.logger.error(error);
      if (error instanceof BadRequestException) {
        throw new BadRequestException(error.message);
      } else {
        throw new BadRequestException('Error in restartBet');
      }
    }
  }

  private _formatBets(payload: BetDto[]): BetDto[] {
    return payload.map((bet) => {
      if (bet.numberPair.length > 4) {
        throw new BadRequestException('Invalid number pair');
      }

      return {
        ...bet,
        numberPair:
          bet.numberPair.length < 4
            ? bet.numberPair.padStart(4, '0')
            : bet.numberPair,
      };
    });
  }
  private async validateBets(payload: BetDto[], queryRunner: QueryRunner) {
    const currentEpoch = await this._getCurrentEpoch(queryRunner);
    const numberPairs = payload.map((bet) => bet.numberPair);

    // const allGamesArr = await this.gameRepository.find({
    //   where: {
    //     isClosed: false,
    //   },
    //   order: {
    //     epoch: 'ASC',
    //   },
    // });
    const allGamesArr = await queryRunner.manager
      .createQueryBuilder(Game, 'game')
      .where('game.isClosed = :isClosed', { isClosed: false })
      .orderBy('game.epoch', 'ASC')
      .getMany();

    if (allGamesArr.length < this.MAX_NUMBER_OF_DRAWS) {
      throw new InternalServerErrorException('Invalid game data');
    }

    const betHistory = await this.betRepository
      .createQueryBuilder('bet')
      .leftJoinAndSelect('bet.game', 'game')
      .where('bet.numberPair IN (:...numberPairs)', { numberPairs })
      .andWhere('bet.game IN (:...gameIds)', {
        gameIds: allGamesArr.map((game) => game.id),
      })
      .getMany();

    for (const bet of payload) {
      for (let i = 0; i < bet.numberOfDraws; i++) {
        if (+allGamesArr[i].epoch < +currentEpoch) {
          throw new BadRequestException('Epoch is in the past');
        }

        const totalAmount = +bet.bigForecastAmount + bet.smallForecastAmount;
        if (totalAmount < +allGamesArr[i].minBetAmount) {
          throw new BadRequestException('Bet amount is less than min allowed');
        }

        const betHistoryForThisBet = betHistory.filter(
          (_betHistory) =>
            _betHistory.numberPair === bet.numberPair &&
            _betHistory.game.epoch === allGamesArr[i].epoch,
        );

        const totalPastBetAmountsForThisBet = betHistoryForThisBet.reduce(
          (acc, bet) =>
            acc +
            Number(bet.bigForecastAmount) +
            Number(bet.smallForecastAmount),
          0,
        );

        const drawsForThisNumberPair = payload.filter(
          (_bet) =>
            _bet.numberPair === bet.numberPair && _bet.numberOfDraws - 1 >= i,
        );

        const totalAmountForThisNumberPair = drawsForThisNumberPair.reduce(
          (acc, bet) =>
            acc +
            Number(bet.bigForecastAmount) +
            Number(bet.smallForecastAmount),
          0,
        );

        if (
          totalPastBetAmountsForThisBet + totalAmountForThisNumberPair >
          allGamesArr[i].maxBetAmount
        ) {
          throw new BadRequestException('bet.AMOUNT_EXCEEDS_MAX_ALLOWED');
        }
      }
    }
  }

  private validateCreditAndBalance(
    actualWalletBalance: number,
    creditRemaining: number,
    userInfo: User,
    bet: BetOrder,
  ): {
    creditRemaining: number;
    walletBalanceRemaining: number;
    walletBalanceUsed: number;
    creditBalanceUsed: number;
    creditWalletTxn: CreditWalletTx;
  } {
    const walletBalance = actualWalletBalance;
    let creditWalletTxn: CreditWalletTx;

    const maxAllowedCreditAmount =
      Number(this.configService.get('MAX_CREDIT_AMOUNT')) || 1;
    let totalBetAmount = 0;
    let totalCreditUsed = 0;
    let walletBalanceUsed = 0;

    const betAmount =
      Number(bet.bigForecastAmount) + Number(bet.smallForecastAmount);
    totalBetAmount += betAmount;

    if (creditRemaining > 0) {
      const creditAvailable =
        creditRemaining > +maxAllowedCreditAmount
          ? +maxAllowedCreditAmount
          : creditRemaining;

      const creditToBeUsed =
        betAmount > creditAvailable ? creditAvailable : betAmount;

      const walletAmount = betAmount - creditToBeUsed;

      walletBalanceUsed += walletAmount;

      totalCreditUsed += creditToBeUsed;
      creditRemaining -= creditToBeUsed;

      creditWalletTxn = new CreditWalletTx();
      creditWalletTxn.amount = creditToBeUsed;
      creditWalletTxn.txType = CreditWalletTxType.PLAY;
      creditWalletTxn.status = TxStatus.PENDING;
      creditWalletTxn.walletId = userInfo.wallet.id;
      creditWalletTxn.userWallet = userInfo.wallet;
      // creditWalletTxn.campaignId = 0; //TODO
    } else {
      walletBalanceUsed += betAmount;
    }

    return {
      creditRemaining,
      walletBalanceRemaining: walletBalance - walletBalanceUsed,
      walletBalanceUsed,
      creditBalanceUsed: totalCreditUsed,
      creditWalletTxn,
    };
  }

  private async createBetOrders(
    actualWalletBalance: number,
    actualCreditBalance: number,
    userInfo: User,
    payload: BetDto[],
    // walletTx: WalletTx,
    queryRunner: QueryRunner,
  ): Promise<{
    betOrders: BetOrder[];
    totalWalletBalanceUsed: number;
    creditWalletTxns: CreditWalletTx[];
    totalAmount: number;
  }> {
    // const allGames = await this.gameRepository.find({
    //   where: {
    //     isClosed: false,
    //   },
    //   order: {
    //     epoch: 'ASC',
    //   },
    // });
    const allGames = await queryRunner.manager
      .createQueryBuilder(Game, 'game')
      .where('game.isClosed = :isClosed', { isClosed: false })
      .orderBy('game.id', 'ASC')
      .getMany();

    const betOrders: Array<BetOrder> = [];
    let totalWalletBalanceUsed = 0;
    let totalAmount = 0;
    let creditRemaining = Number(actualCreditBalance);
    const creditWalletTxns: Array<CreditWalletTx> = [];

    const currentTime = new Date().getTime();

    payload.map((bet) => {
      const numberPairs = new Set();
      numberPairs.add(bet.numberPair);
      if (bet.isPermutation) {
        const numberPairsGenerated = this._generatePermutations(bet.numberPair);
        numberPairsGenerated.forEach((numberPair) =>
          numberPairs.add(numberPair),
        );
      }

      for (let i = 0; i < bet.numberOfDraws; i++) {
        numberPairs.forEach((numberPair) => {
          const betOrder = new BetOrder();
          betOrder.numberPair = numberPair.toString();
          betOrder.bigForecastAmount = bet.bigForecastAmount;
          betOrder.smallForecastAmount = bet.smallForecastAmount;
          betOrder.game = allGames[i];
          betOrder.isMasked =
            allGames[i].endDate.getTime() - currentTime <
            this.maskingIntervalInSeconds;

          const {
            creditRemaining: creditAmountRemaining,
            walletBalanceRemaining,
            walletBalanceUsed,
            creditBalanceUsed,
            creditWalletTxn,
          } = this.validateCreditAndBalance(
            actualWalletBalance,
            creditRemaining,
            userInfo,
            betOrder,
          );

          if (creditWalletTxn) {
            creditRemaining = creditAmountRemaining;
            betOrder.creditWalletTx = creditWalletTxn;
            creditWalletTxns.push(creditWalletTxn);
          }

          totalWalletBalanceUsed += walletBalanceUsed;
          totalAmount += walletBalanceUsed + creditBalanceUsed;

          betOrder.gameId = betOrder.game.id;
          betOrder.motherPair = bet.numberPair; //user entered numberPair, not the generated one
          betOrder.type = bet.isPermutation ? 'P' : 'S';

          betOrders.push(betOrder);
        });
      }
    });

    return {
      betOrders,
      totalWalletBalanceUsed,
      creditWalletTxns,
      totalAmount,
    };
  }

  private async _getCurrentEpoch(queryRunner: QueryRunner): Promise<string> {
    // const earliestNonClosedGame = await this.gameRepository.findOne({
    //   where: {
    //     isClosed: false,
    //   },
    //   order: {
    //     startDate: 'ASC',
    //   },
    // });
    const earliestNonClosedGame = await queryRunner.manager
      .createQueryBuilder(Game, 'game')
      .where('game.isClosed = :isClosed', { isClosed: false })
      .orderBy('game.startDate', 'ASC')
      .getOne();

    return earliestNonClosedGame.epoch;
  }

  private _generatePermutations(numberPair: string): Array<string> {
    if (numberPair.length < 4) {
      numberPair = numberPair.padStart(4, '0');
    } else if (numberPair.length > 4) {
      throw new BadRequestException('Invalid number pair');
    }

    console.log(`numberPair: ${numberPair}`);
    return this._permutations(numberPair, 4, 24);
  }

  private _permutations(letters, size, limit) {
    const results = [];
    for (let i = 0; i < letters.length; i++) {
      const res = letters[i];
      if (size === 1) {
        results.push(res);
        if (results.length === limit) return results; // Stop when limit is reached
      } else {
        const restLetters = letters.slice(0, i).concat(letters.slice(i + 1)); // Exclude current letter
        const rest = this._permutations(
          restLetters,
          size - 1,
          limit - results.length,
        );
        for (let j = 0; j < rest.length; j++) {
          results.push(res + rest[j]);
          if (results.length === limit) return results; // Stop when limit is reached
        }
      }
    }
    return results;
  }

  private async _checkAllowanceAndApprove(
    userSigner: Wallet,
    allowanceNeeded: bigint,
  ) {
    try {
      const coreContractAddr = this.configService.get('CORE_CONTRACT_ADDRESS');
      const gameUsdTokenContract = GameUSD__factory.connect(
        this.configService.get('GAMEUSD_CONTRACT_ADDRESS'),
        userSigner,
      );

      const allowance = await gameUsdTokenContract.allowance(
        userSigner.address,
        coreContractAddr,
      );

      if (allowanceNeeded != BigInt(0) && allowance < allowanceNeeded) {
        const estimatedGasCost = await gameUsdTokenContract
          .connect(userSigner)
          .approve.estimateGas(coreContractAddr, MaxUint256);
        const tx = await gameUsdTokenContract
          .connect(userSigner)
          .approve(coreContractAddr, MaxUint256, {
            gasLimit:
              estimatedGasCost + (estimatedGasCost * BigInt(30)) / BigInt(100),
          });

        // TODO: Shouldn't use eventEmitter here
        this.eventEmitter.emit(
          'gas.service.reload',
          await userSigner.getAddress(),
          Number(tx.chainId),
        );

        await tx.wait();
        const txStatus = await userSigner.provider.getTransactionReceipt(
          tx.hash,
        );

        if (txStatus.status === 1) {
          console.log('approved');
        } else {
          throw new Error('Error approving');
        }
      }
    } catch (error) {
      throw new Error('Error in approve');
    }
  }

  private async _bet(
    uid: number,
    ticketId: number,
    payload: BetOrder[],
    userSigner: Wallet,
    provider: JsonRpcProvider,
  ) {
    try {
      const coreContractAddr = this.configService.get('CORE_CONTRACT_ADDRESS');
      const coreContract = Core__factory.connect(coreContractAddr, provider);

      this.eventEmitter.emit(
        'gas.service.reload',
        await userSigner.getAddress(),
        this.configService.get('BASE_CHAIN_ID'),
      );

      let totalAmount = 0;
      const bets = [];
      payload.map((bet) => {
        if (bet.smallForecastAmount > 0) {
          bets.push({
            epoch: +bet.game.epoch,
            number: +bet.numberPair,
            amount: parseUnits(bet.smallForecastAmount.toString(), 18),
            forecast: 0,
          });

          totalAmount += +bet.smallForecastAmount;
        }

        if (bet.bigForecastAmount > 0) {
          bets.push({
            epoch: +bet.game.epoch,
            number: +bet.numberPair,
            amount: parseUnits(bet.bigForecastAmount.toString(), 18),
            forecast: 1,
          });

          totalAmount += +bet.bigForecastAmount;
        }
      });

      await this._checkAllowanceAndApprove(userSigner, ethers.MaxUint256);

      console.log('start Estimate gas', uid, ticketId, bets);
      const gasLimit = await coreContract
        .connect(userSigner)
        [
          'bet(uint256,uint256,(uint256,uint256,uint256,uint8)[])'
        ].estimateGas(uid, ticketId, bets);
      console.log('gasLimit', gasLimit.toString());

      const tx = await coreContract
        .connect(userSigner)
        [
          'bet(uint256,uint256,(uint256,uint256,uint256,uint8)[])'
        ](uid, ticketId, bets, {
          gasLimit: gasLimit + (gasLimit * BigInt(30)) / BigInt(100),
        });

      await tx.wait();

      // Used for earlier check and top up for next transaction
      this.eventEmitter.emit(
        'gas.service.reload',
        await userSigner.getAddress(),
        Number(tx.chainId),
      );
      return tx;
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error in betWithoutCredit');
    }
  }

  async submitBet(job: Job<SubmitBetJobDTO>): Promise<any> {
    const { gameUsdTxId, userWalletId } = job.data;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.startTransaction();

      const gameUsdTx = await queryRunner.manager
        .createQueryBuilder(GameUsdTx, 'gameUsdTx')
        .leftJoinAndSelect('gameUsdTx.walletTxs', 'walletTxs')
        .leftJoinAndSelect('walletTxs.userWallet', 'userWallet')
        .leftJoinAndSelect('walletTxs.betOrders', 'betOrders')
        .leftJoinAndSelect('userWallet.user', 'user')
        .leftJoinAndSelect('betOrders.creditWalletTx', 'creditWalletTx')
        .leftJoinAndSelect('betOrders.game', 'game')
        .where('gameUsdTx.id = :id', { id: gameUsdTxId })
        .getOne();

      const betOrdersDb = await queryRunner.manager
        .createQueryBuilder(BetOrder, 'betOrder')
        .leftJoinAndSelect('betOrder.game', 'game')
        .where('betOrder.gameUsdTxId = :id', { id: gameUsdTx.id })
        .getMany();

      const containsMasked = betOrdersDb.some((bet) => bet.isMasked);
      const betOrders = betOrdersDb.filter((bet) => !bet.isMasked);

      const userWallet = await queryRunner.manager
        .createQueryBuilder(UserWallet, 'userWallet')
        .leftJoinAndSelect('userWallet.user', 'user')
        .where('userWallet.id = :id', {
          id: userWalletId,
        })
        .getOne();

      //if txHash is not set (first time submission) and contains *ONLY* masked bets, then set txHash and commit transaction
      console.log('betOrdersDb', JSON.stringify(betOrdersDb));
      console.log('gameUsdTx', JSON.stringify(gameUsdTx));
      console.log('containsMasked', containsMasked);
      console.log('betOrders', betOrders.length);
      if (!gameUsdTx.txHash && containsMasked && betOrders.length === 0) {
        gameUsdTx.txHash = randomUUID();
        gameUsdTx.status = TxStatus.SUCCESS;
        await queryRunner.manager.save(gameUsdTx);
        await queryRunner.commitTransaction();

        const jobId = `updateBetStatus-${gameUsdTx.id}`;
        await this.queueService.addDynamicQueueJob(
          `${QueueName.BET}_${userWallet.walletAddress}`,
          jobId,
          {
            jobHandler: this.handleTxSuccess.bind(this),
            failureHandler: this.onOnchainTxFailed.bind(this),
          },
          {
            gameUsdTxId: gameUsdTx.id,
            isMasked: containsMasked,
            queueType: QueueType.SUBMIT_SUCCESS_PROCESS,
          },
          0, // no delay
        );

        // console.log('Masked bets only, setting txHash and returning');

        return true;
      }

      // Check if txHash is already present and no need to submit onchain again
      if (gameUsdTx.txHash) {
        const jobId = `updateBetStatus-${gameUsdTx.id}`;
        await this.queueService.addDynamicQueueJob(
          `${QueueName.BET}_${userWallet.walletAddress}`,
          jobId,
          {
            jobHandler: this.handleTxSuccess.bind(this),
            failureHandler: this.onOnchainTxFailed.bind(this),
          },
          {
            gameUsdTxId: gameUsdTx.id,
            isMasked: containsMasked,
            queueType: QueueType.SUBMIT_SUCCESS_PROCESS,
          },
          0, // no delay
        );

        // console.log('txHash already present, returning');

        return true;
      }

      if (betOrders.length === 0) {
        //This happens when all bets are masked
        // console.log('All bets are masked, returning');
        return true;
      }

      const provider = new JsonRpcProvider(
        this.configService.get(
          `PROVIDER_RPC_URL_${this.configService.get('BASE_CHAIN_ID')}`,
        ),
      );
      const userSigner = new Wallet(
        await MPC.retrievePrivateKey(userWallet.walletAddress),
        provider,
      );

      // console.log('submitting bet', betOrders);
      const onchainTx = await this._bet(
        Number(userWallet.user.uid),
        gameUsdTxId,
        betOrders,
        userSigner,
        provider,
      );

      const txReceipt = await provider.getTransactionReceipt(onchainTx.hash);
      if (txReceipt && txReceipt.status === 1) {
        // Need to commit transaction immediately if onchain tx is successful
        // This is the reason why need queue to prevent re-submit onchain again if failed to execute job and retry
        // Prevent the resubmission when walletTx are being used in other transactions (faced deadlocks)
        gameUsdTx.txHash = onchainTx.hash;
        gameUsdTx.status = TxStatus.SUCCESS;
        await queryRunner.manager.save(gameUsdTx);
      } else {
        throw new Error('Error in submitBet');
      }

      await queryRunner.commitTransaction();

      const jobId = `updateBetStatus-${gameUsdTx.id}`;
      await this.queueService.addDynamicQueueJob(
        `${QueueName.BET}_${userWallet.walletAddress}`,
        jobId,
        {
          jobHandler: this.handleTxSuccess.bind(this),
          failureHandler: this.onOnchainTxFailed.bind(this),
        },
        {
          gameUsdTxId: gameUsdTx.id,
          isMasked: containsMasked,
          queueType: QueueType.SUBMIT_SUCCESS_PROCESS,
        },
        0, // no delay
      );

      // process jackpot
      await this.processJackpot(userWallet, gameUsdTx, betOrders, queryRunner);
    } catch (error) {
      this.logger.error(error);
      await queryRunner.rollbackTransaction();
      //throwing to handle in onFailed
      throw new Error('Error in submitBet');
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  async onOnchainTxFailed(job: Job<SubmitBetJobDTO>, error: Error) {
    const { gameUsdTxId, userWalletId } = job.data;

    const queryRunner = this.dataSource.createQueryRunner();

    try {
      if (job.attemptsMade >= job.opts.attempts) {
        await queryRunner.connect();
        await queryRunner.startTransaction();

        const gameUsdTx = await queryRunner.manager
          .createQueryBuilder(GameUsdTx, 'gameUsdTx')
          .where('gameUsdTx.id = :id', { id: gameUsdTxId })
          .getOne();

        const walletTx = await queryRunner.manager
          .createQueryBuilder(WalletTx, 'walletTx')
          .leftJoinAndSelect('walletTx.gameUsdTx', 'gameUsdTx')
          .where('gameUsdTx.id = :id', { id: gameUsdTx.id })
          .getOne();

        const creditWalletTxns = await queryRunner.manager
          .createQueryBuilder(CreditWalletTx, 'creditWalletTx')
          .leftJoinAndSelect('creditWalletTx.gameUsdTx', 'gameUsdTx')
          .where('gameUsdTx.id = :id', { id: gameUsdTx.id })
          .getMany();

        gameUsdTx.status = TxStatus.FAILED;
        await queryRunner.manager.save(gameUsdTx);

        if (walletTx) {
          walletTx.status = TxStatus.FAILED;
          await queryRunner.manager.save(walletTx);
        }

        const creditTxnIds = creditWalletTxns.map((tx) => tx.id);

        if (creditTxnIds.length > 0) {
          await queryRunner.manager
            .createQueryBuilder(CreditWalletTx, 'creditWalletTx')
            .update()
            .set({ status: TxStatus.FAILED })
            .where('id IN (:...creditTxnIds)', { creditTxnIds })
            .execute();
        }

        await queryRunner.commitTransaction();
      }
    } catch (error) {
      this.logger.error(error);
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  async handleTxSuccess(job: Job<{ gameUsdTxId: number; isMasked: boolean }>) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    let isTransactionCommitted = false;
    let gameUsdTx: GameUsdTx;
    let userWallet: UserWallet;
    let walletTx: WalletTx;

    try {
      await queryRunner.startTransaction();

      gameUsdTx = await queryRunner.manager
        .createQueryBuilder(GameUsdTx, 'gameUsdTx')
        .leftJoinAndSelect('gameUsdTx.walletTxs', 'walletTxs')
        .leftJoinAndSelect('gameUsdTx.betOrders', 'betOrders')
        .leftJoinAndSelect('betOrders.game', 'game')
        .where('gameUsdTx.id = :id', { id: job.data.gameUsdTxId })
        .getOne();

      const creditWalletTxns = await queryRunner.manager
        .createQueryBuilder(CreditWalletTx, 'creditWalletTx')
        .leftJoinAndSelect('creditWalletTx.gameUsdTx', 'gameUsdTx')
        .leftJoinAndSelect('creditWalletTx.userWallet', 'userWallet')
        .leftJoinAndSelect('userWallet.user', 'user')
        .where('gameUsdTx.id = :id', { id: gameUsdTx.id })
        .getMany();

      if (gameUsdTx.walletTxs && gameUsdTx.walletTxs.length > 0) {
        walletTx = await queryRunner.manager
          .createQueryBuilder(WalletTx, 'walletTx')
          .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
          .leftJoinAndSelect('userWallet.user', 'user')
          .where('walletTx.id = :id', { id: gameUsdTx.walletTxs[0].id })
          .getOne();

        walletTx.status = TxStatus.SUCCESS;
        walletTx.txHash = gameUsdTx.txHash;
        walletTx.startingBalance = walletTx.userWallet.walletBalance
          ? walletTx.userWallet.walletBalance
          : 0;
        walletTx.endingBalance =
          walletTx.userWallet.walletBalance - walletTx.txAmount;

        userWallet = walletTx.userWallet;
        userWallet.walletBalance = walletTx.endingBalance;

        await queryRunner.manager.save(walletTx);
      }

      if (creditWalletTxns.length > 0) {
        userWallet = !userWallet ? creditWalletTxns[0].userWallet : userWallet;
        let previousEndingCreditBalance =
          creditWalletTxns[0].userWallet.creditBalance || 0;

        for (let i = 0; i < creditWalletTxns.length; i++) {
          const creditWalletTx = creditWalletTxns[i];
          // console.log('processing creditWalletTx', creditWalletTx.id);
          creditWalletTx.startingBalance = previousEndingCreditBalance;

          const endBalance = previousEndingCreditBalance
            ? previousEndingCreditBalance - creditWalletTx.amount
            : creditWalletTx.amount;
          creditWalletTx.endingBalance = endBalance;

          creditWalletTx.status = TxStatus.SUCCESS;
          await queryRunner.manager.save(creditWalletTx);

          previousEndingCreditBalance = endBalance;
        }

        if (!userWallet) {
          userWallet = creditWalletTxns[0].userWallet;
        }
        userWallet.creditBalance = previousEndingCreditBalance;
      }

      ///////////////Update Points/////////////////////
      const user = userWallet.user;

      // TODO: Using query runner cannot use repository at the same time
      const xpPoints = await this.pointService.getBetPoints(
        gameUsdTx.amount, // total amount of betting
        gameUsdTx.id,
        userWallet.id,
      );

      const pointTxStartingBalance = userWallet.pointBalance || 0;
      const pointTxEndingBalance =
        Number(userWallet.pointBalance || 0) + Number(xpPoints);
      await queryRunner.manager.insert(PointTx, {
        amount: xpPoints,
        txType: PointTxType.BET,
        walletId: userWallet.id,
        userWallet: userWallet,
        gameUsdTx,
        startingBalance: pointTxStartingBalance,
        endingBalance: pointTxEndingBalance,
      });

      userWallet.pointBalance = pointTxEndingBalance;
      await queryRunner.manager.save(userWallet);

      await queryRunner.commitTransaction();
      isTransactionCommitted = true;

      //Process referral immediately if the bet is not masked.
      if (!job.data.isMasked) {
        const jobId = `handleBetReferral-${gameUsdTx.id}`;
        await this.queueService.addJob(QueueName.BET, jobId, {
          userId: user.id,
          betAmount: walletTx ? Number(walletTx.txAmount) : 0,
          gameUsdTxId: gameUsdTx.id,
          queueType: QueueType.BETTING_REFERRAL_DISTRIBUTION,
        });
      }
    } catch (error) {
      this.logger.error(error);
      await queryRunner.rollbackTransaction();
      throw new Error('Error in handleTxSuccess');
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }

    if (isTransactionCommitted) {
      const userLanguage = await this.userService.getUserLanguage(
        userWallet.userId,
      );
      await this.userService.setUserNotification(userWallet.userId, {
        type: 'bet',
        title: 'Buy Order Processed Successfully',
        message: this.i18n.translate('bet.BET_SUCCESS', {
          lang: userLanguage || 'en',
        }),
        gameUsdTxId: gameUsdTx.id,
      });
    }
  }

  async handleReferralFlow(job: Job<HandleReferralFlowDTO>) {
    const queryRunner = this.dataSource.createQueryRunner();
    const { userId, betAmount, gameUsdTxId } = job.data;

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const userInfo = await queryRunner.manager
        .createQueryBuilder(User, 'user')
        .leftJoinAndSelect('user.referralUser', 'referralUser')
        .leftJoinAndSelect('referralUser.wallet', 'wallet')
        .where('user.id = :id', { id: userId })
        .getOne();

      if (!userInfo || userInfo.referralUserId == null) return;

      const ignoredReferrersSetting = await queryRunner.manager.findOne(
        Setting,
        {
          where: {
            key: SettingEnum.FILTERED_REFERRAL_CODES,
          },
        },
      );

      const ignoredRefferers: Array<string> | null =
        ignoredReferrersSetting.value
          ? JSON.parse(ignoredReferrersSetting.value)
          : null;

      if (
        ignoredRefferers &&
        ignoredRefferers.length > 0 &&
        ignoredRefferers.includes(userInfo.referralUser.referralCode)
      ) {
        return;
      }

      const referralUserInfo = await queryRunner.manager.findOne(User, {
        where: {
          id: userInfo.referralUserId,
        },
        relations: ['wallet'],
      });

      const commissionAmount =
        betAmount *
        this.referralCommissionByRank(userInfo.referralUser.referralRank);

      // Used credit balance no need pay commission
      if (commissionAmount === 0) {
        return;
      }

      const walletTxInserted = new WalletTx();
      walletTxInserted.txType = WalletTxType.REFERRAL;
      walletTxInserted.txAmount = commissionAmount;
      walletTxInserted.status = TxStatus.PENDING;
      walletTxInserted.userWalletId = referralUserInfo.wallet.id;
      walletTxInserted.userWallet = referralUserInfo.wallet;
      walletTxInserted.startingBalance =
        referralUserInfo.wallet.walletBalance || 0;
      walletTxInserted.endingBalance =
        Number(referralUserInfo.wallet.walletBalance || 0) + commissionAmount;

      await queryRunner.manager.save(walletTxInserted);

      const walletTx = await queryRunner.manager
        .createQueryBuilder(WalletTx, 'walletTx')
        .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
        .where('walletTx.id = :id', {
          id: walletTxInserted.id,
        })
        .getOne();

      // Returns false if the user doesn't have enough balance and reload is pending
      await this.checkNativeBalance(
        referralUserInfo.wallet,
        +this.configService.get('BASE_CHAIN_ID'),
      );

      const provider = new JsonRpcProvider(
        this.configService.get(
          'PROVIDER_RPC_URL_' + this.configService.get('BASE_CHAIN_ID'),
        ),
      );
      const distributeReferralFeeBot = new Wallet(
        await MPC.retrievePrivateKey(
          this.configService.get('DISTRIBUTE_REFERRAL_FEE_BOT_ADDRESS'),
        ),
        provider,
      );
      const depositContract = Deposit__factory.connect(
        this.configService.get('DEPOSIT_CONTRACT_ADDRESS'),
        distributeReferralFeeBot,
      );

      // reload distribute referral fee bot if needed
      this.eventEmitter.emit(
        'gas.service.reload',
        distributeReferralFeeBot.address,
        this.configService.get('BASE_CHAIN_ID'),
      );

      const referralRewardOnchainTx =
        await depositContract.distributeReferralFee(
          userInfo.referralUser.wallet.walletAddress,
          ethers.parseEther(commissionAmount.toString()),
        );

      await referralRewardOnchainTx.wait();

      const gameUsdTxInserted = await queryRunner.manager.insert(GameUsdTx, {
        amount: commissionAmount,
        status: TxStatus.SUCCESS,
        retryCount: 0,
        chainId: +this.configService.get('BASE_CHAIN_ID'),
        senderAddress: this.configService.get('GAMEUSD_POOL_CONTRACT_ADDRESS'),
        receiverAddress: userInfo.referralUser.wallet.walletAddress,
        walletTxs: [walletTx],
        walletTxId: walletTx.id,
        txHash: referralRewardOnchainTx.hash, //betTxHash,
      });

      await queryRunner.manager.update(WalletTx, walletTx.id, {
        txHash: referralRewardOnchainTx.hash,
        status: TxStatus.SUCCESS,
        gameUsdTx: {
          id: gameUsdTxInserted.identifiers[0].id,
        },
      });

      const gameUsdTx = await queryRunner.manager.findOne(GameUsdTx, {
        where: {
          id: gameUsdTxId,
        },
      });
      const referralTx = new ReferralTx();
      referralTx.rewardAmount = commissionAmount;
      referralTx.referralType = ReferralTxType.BET;
      referralTx.walletTx = walletTx;
      referralTx.userId = userInfo.id;
      referralTx.status = TxStatus.SUCCESS;
      referralTx.txHash = referralRewardOnchainTx.hash;
      referralTx.referralUserId = userInfo.referralUserId; //one who receives the referral amount
      referralTx.gameUsdTx = gameUsdTx; // Store the betting gameUsdTx to keep track the commission coming from which bets

      await queryRunner.manager.save(referralTx);
      //Update Referrer
      const referrerWallet = await queryRunner.manager.findOne(UserWallet, {
        where: {
          id: walletTx.userWalletId,
        },
        relations: ['user'],
      });

      referrerWallet.walletBalance = walletTx.endingBalance;

      await this.updateReferrerXpPoints(
        queryRunner,
        betAmount,
        referrerWallet,
        gameUsdTx,
        gameUsdTxInserted.identifiers[0].id,
      );

      await queryRunner.manager.save(referrerWallet);
      await queryRunner.commitTransaction();

      // reload referral wallet if needed
      this.eventEmitter.emit(
        'gas.service.reload',
        referrerWallet.walletAddress,
        this.configService.get('BASE_CHAIN_ID'),
      );
    } catch (error) {
      this.logger.error('Error in handleReferralFlow', error);
      await queryRunner.rollbackTransaction();

      throw new Error('BET: Error processing handleReferralFlow');
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  async onReferralFailed(job: Job<HandleReferralFlowDTO>, error: Error) {
    const queryRunner = this.dataSource.createQueryRunner();
    const { userId, betAmount, gameUsdTxId } = job.data;

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const userInfo = await queryRunner.manager
        .createQueryBuilder(User, 'user')
        .leftJoinAndSelect('user.referralUser', 'referralUser')
        .leftJoinAndSelect('referralUser.wallet', 'wallet')
        .where('user.id = :id', { id: userId })
        .getOne();

      if (!userInfo || userInfo.referralUserId == null) return;

      // Check if the referral tx already exists
      const exist = await queryRunner.manager.findOne(ReferralTx, {
        where: {
          userId: userInfo.referralUser.wallet.id,
          gameUsdTx: {
            id: gameUsdTxId,
          },
        },
      });
      if (exist) return;

      const referralUserInfo = await queryRunner.manager.findOne(User, {
        where: {
          id: userInfo.referralUserId,
        },
        relations: ['wallet'],
      });

      const commissionAmount =
        betAmount * this.referralCommissionByRank(userInfo.referralRank);

      if (commissionAmount === 0) {
        return;
      }

      const walletTxInserted = new WalletTx();
      walletTxInserted.txType = WalletTxType.REFERRAL;
      walletTxInserted.txAmount = commissionAmount;
      walletTxInserted.status = TxStatus.FAILED;
      walletTxInserted.userWalletId = referralUserInfo.wallet.id;
      walletTxInserted.userWallet = referralUserInfo.wallet;
      walletTxInserted.startingBalance = Number(
        referralUserInfo.wallet.walletBalance || 0,
      );
      walletTxInserted.endingBalance =
        Number(referralUserInfo.wallet.walletBalance || 0) + commissionAmount;

      await queryRunner.manager.save(walletTxInserted);

      const walletTx = await queryRunner.manager
        .createQueryBuilder(WalletTx, 'walletTx')
        .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
        .where('walletTx.id = :id', {
          id: walletTxInserted.id,
        })
        .getOne();

      await queryRunner.manager.insert(ReferralTx, {
        rewardAmount: commissionAmount,
        referralType: ReferralTxType.BET,
        walletTx,
        userId: userInfo.id,
        status: TxStatus.FAILED,
        referralUserId: userInfo.referralUserId, //one who receives the referral amount
        gameUsdTx: {
          id: gameUsdTxId, // Store the betting gameUsdTx to keep track the commission coming from which bets
        },
      });

      // TODO: Implement this after we added status column to point_tx
      // await this.updateReferrerXpPoints(
      //   queryRunner,
      //   userId,
      //   betAmount,
      //   referralUserInfo.wallet,
      //   walletTx,
      // );

      await queryRunner.commitTransaction();
    } catch (error) {
      this.logger.error('Error in [onReferralFailed]', error);
      await queryRunner.rollbackTransaction();
      throw new Error('BET: Error processing onReferralFailed');
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  async processJackpot(
    userWallet: UserWallet,
    gameUsdTx: GameUsdTx,
    betOrders: BetOrder[],
    queryRunner: QueryRunner,
  ) {
    await queryRunner.startTransaction();
    try {
      // get current jackpot record
      const currentTime = new Date(Date.now());
      const jackpot = await queryRunner.manager
        .createQueryBuilder(Jackpot, 'jackpot')
        .where('jackpot.startTime <= :currentTime', {
          currentTime: currentTime,
        })
        .andWhere('jackpot.endTime >= :currentTime', {
          currentTime: currentTime,
        })
        .getOne();
      if (!jackpot) return;

      // check if any numberPair in betOrders is greater than minimumBetAmount
      for (const betOrder of betOrders) {
        if (
          Number(betOrder.bigForecastAmount) +
            Number(betOrder.smallForecastAmount) >=
          Number(jackpot.minimumBetAmount)
        ) {
          // create jackpotTx record with status pending
          const jackpotTx = new JackpotTx();
          jackpotTx.status = TxStatus.PENDING;
          jackpotTx.walletTxId = betOrder.walletTxId;
          jackpotTx.jackpotId = jackpot.id;
          await queryRunner.manager.save(jackpotTx);
          await queryRunner.commitTransaction();

          // add job to participate jackpot
          await this.queueService.addDynamicQueueJob(
            `${QueueName.BET}_${userWallet.walletAddress}`,
            `participateJackpot-${gameUsdTx.id}`,
            {
              jobHandler: this.handleParticipateJackpot.bind(this),
              failureHandler: this.onParticipateJackpotFailed.bind(this),
            },
            {
              walletAddress: userWallet.walletAddress,
              uid: userWallet.user.uid,
              ticketId: gameUsdTx.id,
              feeTokenAddress: jackpot.feeTokenAddress,
              feeAmount: ethers
                .parseEther(jackpot.feeAmount.toString())
                .toString(),
              jackpotId: jackpot.id,
              jackpotTxId: jackpotTx.id,
              queueType: QueueType.PARTICIPATE_JACKPOT,
            } as ParticipateJackpotDTO,
          );
          break;
        }
      }
    } catch (error) {
      this.logger.error('Error in processJackpot', error);
      await queryRunner.rollbackTransaction();
      // inform admin
      await this.adminNotificationService.setAdminNotification(
        `Error occur in bet.service.processJackpot, error: ${error}`,
        'TRANSACTION_ROLLBACK',
        'Transaction Rollback When Process Jackpot',
        true,
        true,
        gameUsdTx.walletTxId,
      );
    }
    // queryRunner release in parent function
  }

  async handleParticipateJackpot(job: Job<ParticipateJackpotDTO>) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const {
        walletAddress,
        uid,
        ticketId,
        feeTokenAddress,
        feeAmount,
        jackpotId,
        jackpotTxId,
      } = job.data;

      const jackpot = await queryRunner.manager
        .createQueryBuilder(Jackpot, 'jackpot')
        .where('jackpot.id = :id', { id: jackpotId })
        .getOne();

      // jackpot signer authorize this participate jackpot tx
      const jackpotSigner = new Wallet(
        await MPC.retrievePrivateKey(
          this.configService.get('JACKPOT_SIGNER_ADDRESS'),
        ),
      );
      const hash = ethers.solidityPackedKeccak256(
        [
          'string',
          'address',
          'uint256',
          'uint256',
          'address',
          'uint256',
          'uint256',
        ],
        [
          jackpot.projectName,
          walletAddress,
          Number(uid),
          ticketId,
          feeTokenAddress,
          feeAmount,
          this.configService.get('BASE_CHAIN_ID'),
        ],
      );
      const signature = await jackpotSigner.signMessage(ethers.getBytes(hash));
      // participate jackpot on-chain tx is executed by user wallet
      const userSigner = new Wallet(
        await MPC.retrievePrivateKey(walletAddress),
        new JsonRpcProvider(
          this.configService.get(
            'PROVIDER_RPC_URL_' + this.configService.get('BASE_CHAIN_ID'),
          ),
        ),
      );
      const jackpotContract = Jackpot__factory.connect(
        this.configService.get('JACKPOT_CONTRACT_ADDRESS'),
        userSigner,
      );
      const txResponse = await jackpotContract.participate(
        jackpot.projectName,
        walletAddress,
        uid,
        ticketId,
        feeTokenAddress,
        feeAmount,
        signature,
      );
      const txReceipt = await txResponse.wait();

      if (txReceipt && txReceipt.status === 1) {
        // on-chain tx success, set txHash & randomHash(for jackpot) into jackpotTx
        // if error within this block, this job will be retried again but on-chain tx won't succees because the signature is already used
        const jackpotTx = await queryRunner.manager
          .createQueryBuilder(JackpotTx, 'jackpotTx')
          .where('jackpotTx.id = :id', { id: jackpotTxId })
          .getOne();
        jackpotTx.txHash = txReceipt.hash;
        jackpotTx.status = TxStatus.SUCCESS;
        jackpotTx.randomHash = txReceipt.logs.find(
          (log) =>
            log.topics[0] ===
            jackpotContract.interface.getEvent('Participated').topicHash,
        )?.topics[3]; // randomHash
        await queryRunner.manager.save(jackpotTx);

        await queryRunner.commitTransaction();
      } else {
        // on-chain tx failed, retry again in next job
        throw new Error(
          `handleParticipateJackpot: on-chain tx failed, tx hash: ${txReceipt.hash}`,
        );
      }
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new Error(`handleParticipateJackpot error: ${error}`);
    } finally {
      await queryRunner.release();
    }
  }

  async onParticipateJackpotFailed(
    job: Job<ParticipateJackpotDTO>,
    error: Error,
  ) {
    const { jackpotTxId } = job.data;
    const jackpotTx = await this.jackpotTxRepository
      .createQueryBuilder('jackpotTx')
      .where('jackpotTx.id = :id', { id: jackpotTxId })
      .getOne();

    this.logger.error(
      'Error in onParticipateJackpotFailed from handleParticipateJackpot',
      error,
    );

    if (job.attemptsMade >= job.opts.attempts) {
      jackpotTx.status = TxStatus.FAILED;
    } else {
      jackpotTx.retryCount++;
    }
    await this.jackpotTxRepository.save(jackpotTx);
  }

  async restartHandleReferralFlow(walletTxId: number, gameUsdTxId: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const walletTx = await queryRunner.manager.findOne(WalletTx, {
        where: {
          id: walletTxId,
        },
        relations: ['userWallet'],
      });

      if (!walletTx) return;

      walletTx.status = TxStatus.SUCCESS;
      await queryRunner.manager.save(walletTx);

      // Returns false if the user doesn't have enough balance and reload is pending
      await this.checkNativeBalance(
        walletTx.userWallet,
        +this.configService.get('BASE_CHAIN_ID'),
      );

      const depositContract = Deposit__factory.connect(
        this.configService.get('DEPOSIT_CONTRACT_ADDRESS'),
        new Wallet(
          await MPC.retrievePrivateKey(
            this.configService.get('DISTRIBUTE_REFERRAL_FEE_BOT_ADDRESS'),
          ),
          new JsonRpcProvider(
            this.configService.get(
              'PROVIDER_RPC_URL_' + this.configService.get('BASE_CHAIN_ID'),
            ),
          ),
        ),
      );

      // Round off to max 2 decimal places
      const amount = Math.floor(Number(walletTx.txAmount) * 100) / 100;
      const referralRewardOnchainTx =
        await depositContract.distributeReferralFee(
          walletTx.userWallet.walletAddress,
          ethers.parseEther(amount.toString()),
        );

      await referralRewardOnchainTx.wait();

      // Create gameUsdTx record
      await queryRunner.manager.insert(GameUsdTx, {
        amount,
        status: TxStatus.SUCCESS,
        retryCount: 0,
        chainId: +this.configService.get('BASE_CHAIN_ID'),
        senderAddress: this.configService.get('GAMEUSD_POOL_CONTRACT_ADDRESS'),
        receiverAddress: walletTx.userWallet.walletAddress,
        walletTxs: [walletTx],
        walletTxId: walletTx.id,
        txHash: referralRewardOnchainTx.hash, //betTxHash,
      });

      // Update referral tx to success
      const referralTx = await queryRunner.manager.findOne(ReferralTx, {
        where: {
          walletTx: {
            id: walletTx.id,
          },
        },
        relations: ['gameUsdTx'],
      });

      referralTx.status = TxStatus.SUCCESS;
      await queryRunner.manager.save(referralTx);

      // Update referrer wallet balance
      const referrerWallet = await queryRunner.manager.findOne(UserWallet, {
        where: {
          id: walletTx.userWalletId,
        },
        relations: ['user'],
      });

      referrerWallet.walletBalance = walletTx.endingBalance;

      const gameUsdTx = await queryRunner.manager.findOne(GameUsdTx, {
        where: {
          id: gameUsdTxId,
        },
      });

      // Update referrer xp points
      await this.updateReferrerXpPoints(
        queryRunner,
        Number(referralTx.gameUsdTx.amount),
        referrerWallet,
        gameUsdTx,
        null,
      );
      await queryRunner.manager.save(referrerWallet);
      await queryRunner.commitTransaction();
    } catch (error) {
      this.logger.error('Error in [restartHandleReferralFlow]', error);
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  async updateReferrerXpPoints(
    queryRunner: QueryRunner,
    betAmount: number,
    referrerWallet: UserWallet,
    gameUsdTx: GameUsdTx,
    distributeReferralGameUsdTxId: number,
  ) {
    // TODO: Shouldn't mix repository with query runner
    const referrerXPAmount = await this.pointService.getBetPointsReferrer(
      referrerWallet.user.id,
      betAmount,
      gameUsdTx.id,
    );

    const startingBalance = Number(referrerWallet.pointBalance) || 0;

    const gameUsdTxObj = {};
    if (distributeReferralGameUsdTxId) {
      Object.assign(gameUsdTxObj, {
        gameUsdTx: {
          id: distributeReferralGameUsdTxId,
        },
      });
    }

    const pointTxInsertResult = await queryRunner.manager.insert(PointTx, {
      amount: referrerXPAmount,
      txType: PointTxType.REFERRAL,
      walletId: referrerWallet.id,
      userWallet: referrerWallet,
      startingBalance,
      endingBalance: startingBalance + referrerXPAmount,
      ...gameUsdTxObj,
    });

    referrerWallet.pointBalance = Number(
      pointTxInsertResult.generatedMaps[0].endingBalance,
    );
  }

  /**
   *
   * @returns Whether the user has enough balance
   */
  private async checkNativeBalance(
    userWallet: UserWallet,
    chainId: number,
  ): Promise<boolean> {
    const provider = new JsonRpcProvider(
      this.configService.get('OPBNB_PROVIDER_RPC_URL'),
    );

    const nativeBalance = await provider.getBalance(userWallet.walletAddress);

    const minimumNativeBalance = this.configService.get(
      `MINIMUM_NATIVE_BALANCE_${chainId}`,
    );

    if (nativeBalance < parseUnits(minimumNativeBalance, 18)) {
      // const pendingReloadTx = await this.reloadTxRepository.findOne({
      //   where: {
      //     userWalletId: userWallet.id,
      //     chainId,
      //     status: TxStatus.PENDING,
      //   },
      // });
      const pendingReloadTx = await this.reloadTxRepository
        .createQueryBuilder('reloadTx')
        .where('reloadTx.userWalletId = :userWalletId', {
          userWalletId: userWallet.id,
        })
        .andWhere('reloadTx.chainId = :chainId', { chainId })
        .andWhere('reloadTx.status = :status', { status: TxStatus.PENDING })
        .getOne();

      if (!pendingReloadTx) {
        console.log(
          'Bet: Emitting gas.service.reload event for userWallet:',
          userWallet.walletAddress,
        );
        this.eventEmitter.emit(
          'gas.service.reload',
          userWallet.walletAddress,
          chainId,
        );
      }

      return false;
    } else {
      return true;
    }
  }
}
