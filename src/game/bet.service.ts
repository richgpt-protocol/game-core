/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, DataSource, QueryRunner, Not } from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { BetDto, EstimateBetResponseDTO } from 'src/game/dto/Bet.dto';
import { Game } from './entities/game.entity';
import { DrawResult } from './entities/draw-result.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { RedeemTx } from 'src/wallet/entities/redeem-tx.entity';
import { BetOrder } from './entities/bet-order.entity';
import { ClaimDetail } from 'src/wallet/entities/claim-detail.entity';
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
import { CreditService } from 'src/wallet/services/credit.service';
import { QueueService } from 'src/queue/queue.service';
import { Job } from 'bullmq';
import { QueueName, QueueType } from 'src/shared/enum/queue.enum';

interface SubmitBetJobDTO {
  walletTxId: number;
  betOrders: number[];
  gameUsdTxId: number;
}
@Injectable()
export class BetService implements OnModuleInit {
  private readonly logger = new Logger(BetService.name);

  constructor(
    @InjectRepository(Game)
    private gameRepository: Repository<Game>,
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
  ) {}
  onModuleInit() {
    //Tries to submit bet onchain
    this.queueService.registerHandler(QueueName.BET, QueueType.SUBMIT_BET, {
      jobHandler: this.submitBet.bind(this),

      //Executed when onchain tx is failed for 5 times continously
      failureHandler: this.onOnchainTxFailed.bind(this),
    });

    //Executed when onchain tx is successful
    this.queueService.registerHandler(
      QueueName.BET,
      QueueType.SUBMIT_SUCCESS_PROCESS,
      {
        jobHandler: this.handleTxSuccess.bind(this),
        failureHandler: this.onOnchainTxFailed.bind(this),
      },
    );
  }

  maskingIntervalInSeconds = 120; //seconds before endTime of currentEpoch after which masking will start

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
        .leftJoinAndSelect('bet.walletTx', 'walletTx')
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
      const betsDb = await this.betRepository
        .createQueryBuilder('bet')
        .leftJoinAndSelect('bet.game', 'game')
        .leftJoinAndSelect('bet.walletTx', 'walletTx')
        .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
        .leftJoinAndSelect('userWallet.user', 'user')
        .orderBy('bet.id', 'DESC')
        .where('walletTx.status = :status', { status: 'S' })
        // .andWhere('walletTx.status = :status', { status: 'S' })
        .limit(count)
        .orderBy('walletTx.createdDate', 'DESC')
        .getMany();

      if (betsDb.length === 0) return [];

      const bets = betsDb.map((bet) => {
        const uid = bet.walletTx.userWallet.user.uid;
        const maskedUID = uid.slice(0, 3) + '****' + uid.slice(uid.length - 3);
        return {
          user: maskedUID,
          amount:
            Number(bet.bigForecastAmount) + Number(bet.smallForecastAmount),
          txHash: bet.walletTx.txHash,
          url:
            this.configService.get('EXPLORER_BASE_URL') +
            '/tx/' +
            bet.walletTx.txHash,
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

        totalAmount +=
          (+bet.bigForecastAmount + +bet.smallForecastAmount) *
          (bet.epochs.length * numberPairs.size);

        return {
          id: index,
          numberPairs: bet.numberPair,
          calculatedAmount: +bet.bigForecastAmount + +bet.smallForecastAmount,
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

      await this.validateBets(payload);

      const walletTx = new WalletTx();
      walletTx.txType = 'PLAY';
      walletTx.status = 'P';
      walletTx.userWalletId = userInfo.wallet.id;
      walletTx.userWallet = userInfo.wallet;
      await queryRunner.manager.save(walletTx);

      const betOrders = await this.createBetOrders(payload, walletTx);
      await queryRunner.manager.save(betOrders);

      const pendingAmountResult = await queryRunner.manager.query(
        `SELECT SUM(txAmount) as pendingAmount FROM wallet_tx
          WHERE
            userWalletId = ${userId} AND
            txType IN ('REDEEM', 'PLAY', 'INTERNAL_TRANSFER') AND
            status IN ('P', 'PD', 'PA')`,
      );
      const pendingAmount = Number(pendingAmountResult[0]?.pendingAmount) || 0;

      const actualWalletBalance =
        pendingAmount >= userInfo.wallet.walletBalance
          ? 0
          : userInfo.wallet.walletBalance - pendingAmount;

      const {
        creditRemaining,
        walletBalanceRemaining,
        walletBalanceUsed,
        creditBalanceUsed,
        creditWalletTxns,
      } = this.validateCreditAndBalance(
        actualWalletBalance,
        userInfo,
        payload,
        betOrders,
      );
      await queryRunner.manager.save(creditWalletTxns);
      await queryRunner.manager.save(betOrders);

      walletTx.txAmount = walletBalanceUsed + creditBalanceUsed;
      walletTx.betOrders = betOrders;
      await queryRunner.manager.save(walletTx);

      const gameUsdTx = new GameUsdTx();
      gameUsdTx.amount = walletBalanceUsed;
      gameUsdTx.status = 'P';
      gameUsdTx.walletTxs = [walletTx];
      gameUsdTx.walletTxId = walletTx.id;
      gameUsdTx.senderAddress = userInfo.wallet.walletAddress;
      gameUsdTx.receiverAddress = this.configService.get(
        'GAMEUSD_POOL_CONTRACT_ADDRESS',
      );
      gameUsdTx.chainId = +this.configService.get('BASE_CHAIN_ID');
      gameUsdTx.retryCount = 0;
      await queryRunner.manager.save(gameUsdTx);

      await queryRunner.commitTransaction();

      // this.eventEmitter.emit(
      //   'gas.service.reload',
      //   userInfo.wallet.walletAddress,
      //   gameUsdTx.chainId,
      // );

      const jobId = `placeBet-${gameUsdTx.id}`;
      await this.queueService.addJob(
        QueueName.BET,
        jobId,
        {
          walletTxId: walletTx.id,
          betOrders: betOrders.map((bet) => bet.id),
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

  async restartBet(gameTxId: number) {
    try {
      const gameusdTx = await this.gameUsdTxRepository.findOne({
        where: {
          id: gameTxId,
          status: Not('S'),
        },
        relations: ['walletTxs', 'walletTxs.betOrders'],
      });

      if (!gameusdTx) {
        throw new BadRequestException('Invalid gameTxId');
      }

      if (gameusdTx.walletTxs[0].txType !== 'PLAY') {
        throw new BadRequestException('Invalid txType');
      }

      const jobId = `placeBet-${gameusdTx.id}`;
      await this.queueService.addJob(
        QueueName.BET,
        jobId,
        {
          gameUsdTxId: gameusdTx.id,
          walletTxId: gameusdTx.walletTxId,
          betOrders: gameusdTx.walletTxs[0].betOrders.map((bet) => bet.id),
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
  private async validateBets(payload: BetDto[]) {
    const currentEpoch = await this._getCurrentEpoch();

    const allEpochs = payload.map((bet) => bet.epochs).flat();
    const numberPairs = payload.map((bet) => bet.numberPair);

    const allGamesArr = await this.gameRepository.find({
      where: {
        epoch: In(allEpochs),
      },
    });

    const allGamesObj = allGamesArr.reduce((acc, game) => {
      acc[game.epoch] = game;
      return acc;
    }, {});

    const betHistory = await this.betRepository
      .createQueryBuilder('bet')
      .leftJoinAndSelect('bet.game', 'game')
      .where('bet.numberPair IN (:...numberPairs)', { numberPairs })
      .andWhere('bet.game IN (:...gameIds)', {
        gameIds: allGamesArr.map((game) => game.id),
      })
      .getMany();

    for (const bet of payload) {
      bet.epochs.forEach((epoch) => {
        if (!allGamesObj[epoch]) {
          throw new BadRequestException('Invalid Epoch');
        }

        if (allGamesObj[epoch].isClosed) {
          throw new BadRequestException('Bet for this epoch is closed');
        }

        if (
          (new Date().getUTCDate() - allGamesObj[epoch].endDate.getTime()) /
            1000 >
          this.maskingIntervalInSeconds
        ) {
          throw new BadRequestException(
            'Bet for this epoch is closed (Masking)',
          );
        }

        if (epoch < +currentEpoch.toString()) {
          throw new BadRequestException('Epoch is in the past');
        }

        // if (epoch > +currentEpoch.toString() + 30) {
        //   throw new BadRequestException('Invalid Epoch');
        // }

        const totalAmount = +bet.bigForecastAmount + bet.smallForecastAmount;

        if (totalAmount < +allGamesObj[epoch].minBetAmount) {
          throw new BadRequestException('Bet amount is less than min allowed');
        }

        const betHistoryForThisBet = betHistory.filter(
          (_betHistory) =>
            _betHistory.numberPair === bet.numberPair &&
            _betHistory.game.epoch === epoch.toString(),
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
            _bet.numberPair === bet.numberPair && _bet.epochs.includes(epoch),
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
          allGamesObj[epoch].maxBetAmount
        ) {
          throw new BadRequestException('Bet amount exceeds max allowed');
        }
      });
    }
  }

  private validateCreditAndBalance(
    actualWalletBalance: number,
    userInfo: User,
    payload: BetDto[],
    bets: BetOrder[],
  ): {
    creditRemaining: number;
    walletBalanceRemaining: number;
    walletBalanceUsed: number;
    creditBalanceUsed: number;
    creditWalletTxns: CreditWalletTx[];
  } {
    const totalCredits = userInfo.wallet.creditBalance;
    const walletBalance = actualWalletBalance;

    const maxAllowedCreditAmount =
      this.configService.get('MAX_CREDIT_AMOUNT') || 1;
    let totalBetAmount = 0;
    let creditRemaining = Number(totalCredits);
    let totalCreditUsed = 0;
    let walletBalanceUsed = 0;

    const creditWalletTxns = [];

    bets.forEach((bet) => {
      if (creditRemaining > 0) {
        const betAmonut =
          Number(bet.bigForecastAmount) + Number(bet.smallForecastAmount);
        const creditAvailable =
          creditRemaining > +maxAllowedCreditAmount
            ? +maxAllowedCreditAmount
            : creditRemaining;

        const creditToBeUsed =
          betAmonut > creditAvailable ? creditAvailable : betAmonut;

        const gameUsdAmount = betAmonut - creditToBeUsed;
        // betAmonut > creditToBeUsed ? betAmonut - creditToBeUsed : 0;

        walletBalanceUsed += gameUsdAmount;

        totalBetAmount += betAmonut;
        totalCreditUsed += creditToBeUsed;
        creditRemaining -= creditToBeUsed;

        const creditWalletTxn = new CreditWalletTx();
        creditWalletTxn.amount = creditToBeUsed;
        creditWalletTxn.txType = 'PLAY';
        creditWalletTxn.status = 'P';
        creditWalletTxn.walletId = userInfo.wallet.id;
        creditWalletTxn.userWallet = userInfo.wallet;
        // creditWalletTxn.campaignId = 0; //TODO

        creditWalletTxns.push(creditWalletTxn);

        bet.creditWalletTx = creditWalletTxn;
      } else {
        bet.creditWalletTx = null;
        totalBetAmount += +bet.bigForecastAmount + +bet.smallForecastAmount;
        walletBalanceUsed += +bet.bigForecastAmount + +bet.smallForecastAmount;
      }
    });

    if (walletBalanceUsed > walletBalance) {
      throw new BadRequestException('Insufficient balance');
    }

    return {
      creditRemaining,
      walletBalanceRemaining: walletBalance - walletBalanceUsed,
      walletBalanceUsed,
      creditBalanceUsed: totalCreditUsed,
      creditWalletTxns,
    };
  }

  private async createBetOrders(
    payload: BetDto[],
    walletTx: WalletTx,
  ): Promise<Array<BetOrder>> {
    const allEpochs = payload.map((bet) => bet.epochs).flat();
    const allGames = await this.gameRepository.find({
      where: {
        epoch: In(allEpochs),
      },
    });

    const betOrders: Array<BetOrder> = [];

    payload.map((bet) => {
      const numberPairs = new Set();
      numberPairs.add(bet.numberPair);
      if (bet.isPermutation) {
        const numberPairsGenerated = this._generatePermutations(bet.numberPair);
        numberPairsGenerated.forEach((numberPair) =>
          numberPairs.add(numberPair),
        );
      }

      return bet.epochs.map((epoch) => {
        numberPairs.forEach((numberPair) => {
          const betOrder = new BetOrder();
          betOrder.numberPair = numberPair.toString();
          betOrder.bigForecastAmount = bet.bigForecastAmount;
          betOrder.smallForecastAmount = bet.smallForecastAmount;
          betOrder.game = allGames.find(
            (game) => game.epoch === epoch.toString(),
          );
          betOrder.gameId = betOrder.game.id;
          betOrder.walletTxId = walletTx.id;
          betOrder.motherPair = bet.numberPair; //user entered numberPair, not the generated one
          betOrder.type = bet.isPermutation ? 'P' : 'S';

          betOrders.push(betOrder);
        });
      });
    });

    return betOrders;
  }

  private async _getCurrentEpoch() {
    const earliestNonClosedGame = await this.gameRepository.findOne({
      where: {
        isClosed: false,
      },
      order: {
        startDate: 'ASC',
      },
    });

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
      this.logger.error(error);
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

      const gasLimit = await coreContract
        .connect(userSigner)
        [
          'bet(uint256,uint256,(uint256,uint256,uint256,uint8)[])'
        ].estimateGas(uid, ticketId, bets);

      const tx = await coreContract
        .connect(userSigner)
        [
          'bet(uint256,uint256,(uint256,uint256,uint256,uint8)[])'
        ](uid, ticketId, bets, {
          gasLimit: gasLimit + (gasLimit * BigInt(30)) / BigInt(100),
        });
      await tx.wait();

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
        .where('gameUsdTx.id = :id', { id: job.data.gameUsdTxId })
        .getOne();

      console.log('Processing gameUsdTx id:', gameUsdTx.id);

      const userWallet = await queryRunner.manager
        .createQueryBuilder(UserWallet, 'userWallet')
        .leftJoinAndSelect('userWallet.user', 'user')
        .where('userWallet.id = :id', {
          id: gameUsdTx.walletTxs[0].userWalletId,
        })
        .getOne();

      if (gameUsdTx.txHash) {
        const jobId = `updateBetStatus-${gameUsdTx.id}`;
        await this.queueService.addJob(
          QueueName.BET,
          jobId,
          {
            gameUsdTxId: gameUsdTx.id,
            queueType: QueueType.SUBMIT_SUCCESS_PROCESS,
          },
          0, // no delay
        );

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
      const onchainTx = await this._bet(
        Number(userWallet.user.uid),
        job.data.walletTxId,
        gameUsdTx.walletTxs[0].betOrders,
        userSigner,
        provider,
      );

      const txReceipt = await provider.getTransactionReceipt(onchainTx.hash);
      if (txReceipt && txReceipt.status === 1) {
        gameUsdTx.txHash = onchainTx.hash;
        await queryRunner.manager.save(gameUsdTx);
      } else {
        throw new Error('Error in submitBet');
      }

      await queryRunner.commitTransaction();

      const jobId = `updateBetStatus-${gameUsdTx.id}`;
      await this.queueService.addJob(
        QueueName.BET,
        jobId,
        {
          gameUsdTxId: gameUsdTx.id,
          queueType: QueueType.SUBMIT_SUCCESS_PROCESS,
        },
        0, // no delay
      );
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
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      if (job.attemptsMade >= job.opts.attempts) {
        await queryRunner.connect();
        await queryRunner.startTransaction();

        const gameUsdTx = await queryRunner.manager
          .createQueryBuilder(GameUsdTx, 'gameUsdTx')
          .leftJoinAndSelect('gameUsdTx.walletTxs', 'walletTxs')
          .leftJoinAndSelect('walletTxs.userWallet', 'userWallet')
          .leftJoinAndSelect('walletTxs.betOrders', 'betOrders')
          .leftJoinAndSelect('userWallet.user', 'user')
          .leftJoinAndSelect('betOrders.creditWalletTx', 'creditWalletTx')
          .leftJoinAndSelect('betOrders.game', 'game')
          .where('gameUsdTx.id = :id', { id: job.data.gameUsdTxId })
          .getOne();

        gameUsdTx.status = 'F';
        gameUsdTx.walletTxs[0].status = 'F';
        const creditTxnIds = gameUsdTx.walletTxs[0].betOrders
          .filter((bet) => bet.creditWalletTx)
          .map((bet) => bet.creditWalletTx.id);

        if (creditTxnIds.length > 0) {
          await queryRunner.manager
            .createQueryBuilder(CreditWalletTx, 'creditWalletTx')
            .update()
            .set({ status: 'F' })
            .where('id IN (:...creditTxnIds)', { creditTxnIds })
            .execute();
        }
        await queryRunner.manager.save(gameUsdTx);
        await queryRunner.manager.save(gameUsdTx.walletTxs[0]);

        await queryRunner.commitTransaction();
      }
    } catch (error) {
      this.logger.error(error);
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  async handleTxSuccess(job: Job<{ gameUsdTxId: number }>) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.startTransaction();

      const gameUsdTx = await queryRunner.manager
        .createQueryBuilder(GameUsdTx, 'gameUsdTx')
        .leftJoinAndSelect('gameUsdTx.walletTxs', 'walletTxs')
        .leftJoinAndSelect('walletTxs.userWallet', 'userWallet')
        .leftJoinAndSelect('userWallet.user', 'user')
        .leftJoinAndSelect('walletTxs.betOrders', 'betOrders')
        .leftJoinAndSelect('betOrders.creditWalletTx', 'creditWalletTx')
        .leftJoinAndSelect('betOrders.game', 'game')
        .where('gameUsdTx.id = :id', { id: job.data.gameUsdTxId })
        .getOne();

      gameUsdTx.status = 'S';
      gameUsdTx.walletTxs[0].status = 'S';
      gameUsdTx.walletTxs[0].txHash = gameUsdTx.txHash;
      gameUsdTx.walletTxs[0].startingBalance =
        gameUsdTx.walletTxs[0].userWallet.walletBalance;
      gameUsdTx.walletTxs[0].endingBalance =
        gameUsdTx.walletTxs[0].startingBalance - gameUsdTx.amount;

      const creditWalletTxns = gameUsdTx.walletTxs[0].betOrders
        .filter((bet) => bet.creditWalletTx)
        .map((bet) => bet.creditWalletTx);

      let previousEndingCreditBalance =
        gameUsdTx.walletTxs[0].userWallet.creditBalance;
      for (let i = 0; i < creditWalletTxns.length; i++) {
        const creditWalletTx = creditWalletTxns[i];
        creditWalletTx.startingBalance = previousEndingCreditBalance;

        const endBalance = previousEndingCreditBalance
          ? previousEndingCreditBalance - creditWalletTx.amount
          : creditWalletTx.amount;
        creditWalletTx.endingBalance = endBalance;

        creditWalletTx.status = 'S';
        await queryRunner.manager.save(creditWalletTx);

        previousEndingCreditBalance = endBalance;
      }
      await queryRunner.manager.save(gameUsdTx);
      //update wallet and credit balance
      const userWallet = gameUsdTx.walletTxs[0].userWallet;
      userWallet.walletBalance = gameUsdTx.walletTxs[0].endingBalance;
      userWallet.creditBalance = previousEndingCreditBalance;

      ///////////////Update Points/////////////////////
      const user = userWallet.user;
      const xpPoints = await this.pointService.getBetPoints(
        user.id,
        gameUsdTx.walletTxs[0].txAmount,
        gameUsdTx.walletTxs[0].id,
      );
      const pointTxStartingBalance = userWallet.pointBalance;
      const pointTxEndingBalance =
        Number(pointTxStartingBalance) + Number(xpPoints);
      const pointTxInsertResult = await queryRunner.manager.insert(PointTx, {
        amount: xpPoints,
        txType: 'BET',
        walletId: userWallet.id,
        userWallet: userWallet,
        walletTx: gameUsdTx.walletTxs[0],
        startingBalance: pointTxStartingBalance,
        endingBalance: pointTxEndingBalance,
      });
      userWallet.pointBalance = pointTxEndingBalance;
      await queryRunner.manager.save(userWallet);
      await queryRunner.manager.save(gameUsdTx.walletTxs[0]);

      await this.handleReferralFlow(
        user.id,
        gameUsdTx.walletTxs[0].txAmount,
        gameUsdTx.txHash,
        gameUsdTx.walletTxs[0].id,
        queryRunner,
      );
      await queryRunner.commitTransaction();

      await this.userService.setUserNotification(
        gameUsdTx.walletTxs[0].userWallet.userId,
        {
          type: 'bet',
          title: 'Buy Order Processed Successfully',
          message: 'Your Buy has been successfully processed',
          walletTxId: gameUsdTx.walletTxs[0].id,
        },
      );
    } catch (error) {
      this.logger.error(error);
      await queryRunner.rollbackTransaction();
      throw new Error('Error in handleTxSuccess');
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  private async handleReferralFlow(
    userId: number,
    betAmount: number,
    betTxHash: string,
    betWalletTxId: number,
    queryRunner?: QueryRunner,
  ) {
    // const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const userInfo = await queryRunner.manager
        .createQueryBuilder(User, 'user')
        .leftJoinAndSelect('user.referralUser', 'referralUser')
        .leftJoinAndSelect('referralUser.wallet', 'wallet')
        .where('user.id = :id', { id: userId })
        .getOne();

      if (!userInfo || userInfo.referralUserId == null) return;

      const referralUserInfo = await queryRunner.manager.findOne(User, {
        where: {
          id: userInfo.referralUserId,
        },
        relations: ['wallet'],
      });

      const commisionAmount =
        betAmount * this.referralCommissionByRank(userInfo.referralRank);

      const walletTxInserted = new WalletTx();
      walletTxInserted.txType = 'REFERRAL';
      walletTxInserted.txAmount = commisionAmount;
      walletTxInserted.status = 'S';
      walletTxInserted.userWalletId = referralUserInfo.wallet.id;
      walletTxInserted.userWallet = referralUserInfo.wallet;
      walletTxInserted.txHash = betTxHash;
      walletTxInserted.startingBalance = referralUserInfo.wallet.walletBalance;
      walletTxInserted.endingBalance =
        Number(walletTxInserted.startingBalance) + commisionAmount;

      await queryRunner.manager.save(walletTxInserted);

      // const walletTx = await queryRunner.manager.findOne(WalletTx, {
      //   where: {
      //     id: walletTxInsertResult.identifiers[0].id,
      //   },
      // });

      const walletTx = await queryRunner.manager
        .createQueryBuilder(WalletTx, 'walletTx')
        .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
        .where('walletTx.id = :id', {
          id: walletTxInserted.id,
        })
        .getOne();

      // Returns false if the user doesn't have enough balance and reload is pending
      const hasBalance = await this.checkNativeBalance(
        walletTx.userWallet,
        +this.configService.get('BASE_CHAIN_ID'),
      );

      const depositContract = Deposit__factory.connect(
        this.configService.get('DEPOSIT_CONTRACT_ADDRESS'),
        new Wallet(
          await MPC.retrievePrivateKey(
            this.configService.get('DEPOSIT_BOT_ADDRESS'),
          ),
          new JsonRpcProvider(
            this.configService.get(
              'PROVIDER_RPC_URL_' + this.configService.get('BASE_CHAIN_ID'),
            ),
          ),
        ),
      );

      const referralRewardOnchainTx =
        await depositContract.distributeReferralFee(
          userInfo.referralUser.wallet.walletAddress,
          ethers.parseEther(commisionAmount.toString()),
        );

      await referralRewardOnchainTx.wait();

      const gameUsdTxInsertResult = await queryRunner.manager.insert(
        GameUsdTx,
        {
          amount: commisionAmount,
          status: 'S',
          retryCount: 0,
          chainId: +this.configService.get('BASE_CHAIN_ID'),
          senderAddress: this.configService.get(
            'GAMEUSD_POOL_CONTRACT_ADDRESS',
          ),
          receiverAddress: userInfo.referralUser.wallet.walletAddress,
          walletTxs: [walletTx],
          walletTxId: walletTx.id,
          txHash: referralRewardOnchainTx.hash, //betTxHash,
        },
      );

      const gameUsdTx = await queryRunner.manager.findOne(GameUsdTx, {
        where: {
          id: gameUsdTxInsertResult.identifiers[0].id,
        },
      });

      const referrelTxInsertResult = await queryRunner.manager.insert(
        ReferralTx,
        {
          rewardAmount: gameUsdTx.amount,
          referralType: 'BET',
          walletTx: walletTx,
          userId: userInfo.id,
          status: 'S',
          referralUserId: userInfo.referralUserId, //one who receives the referral amount
        },
      );

      //Update Referrer
      const referrerWallet = await queryRunner.manager.findOne(UserWallet, {
        where: {
          id: walletTx.userWalletId,
        },
      });

      referrerWallet.walletBalance = walletTx.endingBalance;
      // referrerWallet.redeemableBalance =
      // Number(referrerWallet.redeemableBalance) + Number(gameUsdTx.amount); //commision amount

      await this.updateReferrerXpPoints(
        queryRunner,
        userInfo.referralUserId,
        betAmount,
        referrerWallet,
        betWalletTxId,
        walletTx,
      );

      await queryRunner.manager.save(referrerWallet);

      await queryRunner.commitTransaction();
    } catch (error) {
      this.logger.error('Error in referral tx', error);
      await queryRunner.rollbackTransaction();

      throw new Error('BET: Error processing Referral');
    }
    // } finally {
    //   if (!queryRunner.isReleased) await queryRunner.release();
    // }
  }

  async updateReferrerXpPoints(
    queryRunner: QueryRunner,
    referrer: number,
    betAmount: number,
    referrerWallet: UserWallet,
    betWalletTxId: number,
    walletTx: WalletTx,
  ) {
    const lastValidPointTx = await queryRunner.manager.findOne(PointTx, {
      where: {
        walletId: referrerWallet.id,
      },
      order: {
        createdDate: 'DESC',
      },
    });

    const referrerXPAmount = await this.pointService.getBetPointsReferrer(
      referrer,
      betAmount,
      betWalletTxId,
    );
    referrerWallet.pointBalance =
      Number(referrerWallet.pointBalance) + referrerXPAmount;

    const pointTxInsertResult = await queryRunner.manager.insert(PointTx, {
      amount: referrerXPAmount,
      txType: 'REFERRAL',
      walletId: referrerWallet.id,
      userWallet: referrerWallet,
      startingBalance: lastValidPointTx?.endingBalance || 0,
      endingBalance:
        Number(lastValidPointTx?.endingBalance || 0) + referrerXPAmount,
      walletTx: walletTx,
    });

    referrerWallet.pointBalance =
      pointTxInsertResult.generatedMaps[0].endingBalance;
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
      const pendingReloadTx = await this.reloadTxRepository.findOne({
        where: {
          userWalletId: userWallet.id,
          chainId,
          status: 'P',
        },
      });

      if (!pendingReloadTx) {
        console.log(
          'Bet: Emitting gas.service.reload event for userWallet:',
          userWallet.walletAddress,
        );
        await this.eventEmitter.emit(
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
