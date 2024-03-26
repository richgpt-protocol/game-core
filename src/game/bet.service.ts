/* eslint-disable @typescript-eslint/no-unused-vars */
import { BadRequestException, Injectable } from '@nestjs/common';
import { ChatCompletionMessageParam } from 'openai/resources';
// import { SendMessageDto } from './dto/bet.dto';
// import { MongoClient, WithId } from 'mongodb'
import * as dotenv from 'dotenv';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, DataSource, MoreThanOrEqual } from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BetDto } from 'src/game/dto/Bet.dto';
import { Game } from './entities/game.entity';
import { RedeemDto } from '../redeem/dto/redeem.dto';
import { DrawResultDto } from './dto/drawResult.dto';
import { DrawResult } from './entities/draw-result.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { RedeemTx } from 'src/wallet/entities/redeem-tx.entity';
import { BetOrder } from './entities/bet-order.entity';
import { ClaimDetail } from 'src/wallet/entities/claim-detail.entity';
import { ConfigService } from 'src/config/config.service';

import { Contract, JsonRpcProvider, Wallet, parseUnits } from 'ethers';
import { Core__factory, Helper__factory } from 'src/contract';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { CreditWalletTx } from 'src/wallet/entities/credit-wallet-tx.entity';
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';
import { ReferralTx } from 'src/referral/entities/referral-tx.entity';

dotenv.config();

// const client = new MongoClient('mongodb://localhost:27017')

@Injectable()
export class BetService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserWallet)
    private walletRepository: Repository<UserWallet>,
    @InjectRepository(Game)
    private gameRepository: Repository<Game>,
    @InjectRepository(BetOrder)
    private betRepository: Repository<BetOrder>,
    @InjectRepository(ClaimDetail)
    private claimRepository: Repository<ClaimDetail>,
    @InjectRepository(RedeemTx)
    private redeemRepository: Repository<RedeemTx>,
    @InjectRepository(DrawResult)
    private drawResultRepository: Repository<DrawResult>,
    @InjectRepository(GameUsdTx)
    private gameUsdTxRepository: Repository<GameUsdTx>,
    @InjectRepository(WalletTx)
    private walletTxRepository: Repository<WalletTx>,
    private configService: ConfigService,
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
  ) {}

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
      console.error(error);
      throw new BadRequestException('Error in getBets');
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

      console.log(`Validating bets`); //TODO delete

      await this.validateBets(payload);

      console.log(`Creating bet orders`); //TODO delete

      const walletTx = new WalletTx();
      walletTx.txType = 'DEPOSIT';
      walletTx.status = 'P';
      walletTx.userWalletId = userInfo.wallet.id;
      await queryRunner.manager.save(walletTx);

      const betOrders = await this.createBetOrders(payload, walletTx);
      const {
        creditRemaining,
        walletBalanceRemaining,
        walletBalanceUsed,
        creditBalanceUsed,
      } = this.validateCreditAndBalance(userInfo, payload, betOrders);

      console.log(`Check whether credit is added`); //TODO delete
      console.log(betOrders);

      walletTx.txAmount = 0;
      await queryRunner.manager.save(walletTx);

      await queryRunner.manager.save(betOrders);

      const gameUsdTx = new GameUsdTx();
      gameUsdTx.amount = walletBalanceUsed;
      gameUsdTx.status = 'P';
      gameUsdTx.walletTx = walletTx;
      gameUsdTx.walletTxId = walletTx.id;
      gameUsdTx.senderAddress = userInfo.wallet.walletAddress;
      gameUsdTx.receiverAddress = this.configService.get(
        'GAMEUSD_POOL_ADDRESS',
      );
      gameUsdTx.chainId = +this.configService.get('GAMEUSD_CHAIN_ID');
      gameUsdTx.retryCount = 0;

      await queryRunner.manager.save(gameUsdTx);

      await queryRunner.commitTransaction();

      await this.eventEmitter.emit('bet.submitTx', {
        betsPayload: betOrders,
        walletTx,
        gameUsdTx,
        creditBalanceUsed,
      });
    } catch (error) {
      console.error(`Rolling back Db transaction`);
      console.error(error);
      await queryRunner.rollbackTransaction();
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();

      throw new BadRequestException('Error in bet');
    }
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

    const betHistory = await this.betRepository.find({
      where: {
        numberPair: In(numberPairs),
        game: In(Object.keys(allGamesArr)),
      },
    });

    for (const bet of payload) {
      bet.epochs.forEach((epoch) => {
        if (!allGamesObj[epoch]) {
          throw new BadRequestException('Invalid Epoch');
        }

        if (allGamesObj[epoch].isClosed) {
          throw new BadRequestException('Bet for this epoch is closed');
        }

        if (
          (new Date().getTime() - allGamesObj[epoch].endDate.getTime()) / 1000 >
          this.maskingIntervalInSeconds
        ) {
          throw new BadRequestException(
            'Bet for this epoch is closed (Masking)',
          );
        }

        if (epoch < +currentEpoch.toString()) {
          throw new BadRequestException('Epoch is in the past');
        }

        if (epoch > +currentEpoch.toString() + 30) {
          throw new BadRequestException('Invalid Epoch');
        }

        const totalAmount = bet.bigForecastAmount + bet.smallForecastAmount;

        if (totalAmount < allGamesObj[epoch].minBetAmount) {
          throw new BadRequestException('Bet amount is less than min allowed');
        }

        const betHistoryForThisBet = betHistory.filter(
          (betHistory) =>
            betHistory.numberPair === bet.numberPair &&
            +betHistory.game.epoch === epoch,
        );

        const totalAmountForThisBet = betHistoryForThisBet.reduce(
          (acc, bet) => acc + bet.bigForecastAmount + bet.smallForecastAmount,
          0,
        );

        if (
          totalAmountForThisBet + totalAmount >
          allGamesObj[epoch].maxBetAmount
        ) {
          throw new BadRequestException('Bet amount exceeds max allowed');
        }
      });
    }

    console.log(`Bets validated`); //TODO delete
  }

  private validateCreditAndBalance(
    userInfo: User,
    payload: BetDto[],
    bets: BetOrder[],
  ): {
    creditRemaining: number;
    walletBalanceRemaining: number;
    walletBalanceUsed: number;
    creditBalanceUsed: number;
  } {
    console.log(userInfo);
    const totalCredits = userInfo.wallet.creditBalance;
    const walletBalance = userInfo.wallet.walletBalance;

    const maxAllowedCreditAmount = this.configService.get('MAX_CREDIT_AMOUNT');
    let totalBetAmount = 0;
    let creditRemaining = totalCredits;
    let totalCreditUsed = 0;
    let walletBalanceUsed = 0;

    bets.forEach((bet) => {
      if (creditRemaining) {
        const betAmonut = bet.bigForecastAmount + bet.smallForecastAmount;
        const creditToBeUsed =
          creditRemaining > +maxAllowedCreditAmount
            ? +maxAllowedCreditAmount
            : creditRemaining;
        const gameUsdAmount =
          betAmonut > creditToBeUsed ? betAmonut - creditToBeUsed : 0;

        walletBalanceUsed += gameUsdAmount;

        totalBetAmount += betAmonut;
        totalCreditUsed += creditToBeUsed;
        creditRemaining -= creditToBeUsed;

        bet.creditWalletTx = new CreditWalletTx();
        bet.creditWalletTx.amount = creditToBeUsed;
        bet.creditWalletTx.txType = 'PLAY';
        bet.creditWalletTx.status = 'P';
        bet.creditWalletTx.walletId = userInfo.wallet.id;
      } else {
        bet.creditWalletTx = null;
        totalBetAmount += bet.bigForecastAmount + bet.smallForecastAmount;
      }
    });

    // if (totalCredits && +maxAllowedCreditAmount) {
    //   payload.forEach((bet) => {
    //     const betCount =
    //       this._getPermutationCount(bet.numberPair.padStart(4, '0')) *
    //       bet.epochs.length;
    //     const betAmountPerEpoch = bet.isPermutation
    //       ? (bet.bigForecastAmount + bet.smallForecastAmount) * betCount
    //       : bet.bigForecastAmount + bet.smallForecastAmount;

    //     const betAmount = betAmountPerEpoch * bet.epochs.length;

    //     const maximumCreditAmountNeeded = betCount * +maxAllowedCreditAmount;
    //     totalBetAmount += betAmount;

    //     //enough credits
    //     if (creditRemaining >= maximumCreditAmountNeeded) {
    //       totalCreditUsed +=
    //         betAmount > maximumCreditAmountNeeded
    //           ? maximumCreditAmountNeeded
    //           : betAmount;
    //       creditRemaining -=
    //         betAmount > maximumCreditAmountNeeded
    //           ? maximumCreditAmountNeeded
    //           : betAmount;
    //     } else if (creditRemaining > 0) {
    //       totalCreditUsed += creditRemaining;
    //       creditRemaining = 0;
    //     } else {
    //       // creditRemaining is zero
    //     }
    //   });
    // }
    // const walletBalanceUsed = totalBetAmount - totalCreditUsed;

    if (walletBalanceUsed > walletBalance) {
      throw new BadRequestException('Insufficient balance');
    }

    return {
      creditRemaining,
      walletBalanceRemaining: walletBalance - walletBalanceUsed,
      walletBalanceUsed,
      creditBalanceUsed: totalCreditUsed,
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
          betOrder.game = allGames.find((game) => +game.epoch === epoch);
          betOrder.gameId = betOrder.game.id;
          betOrder.walletTxId = walletTx.id;

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
        epoch: 'ASC',
      },
    });

    // console.log(`earliestNonClosedGame`); //TODO delete
    // console.log(earliestNonClosedGame); //TODO delete
    // const coreContractAddr = this.configService.get('CORE_CONTRACT');
    // const provider = new JsonRpcProvider(this.configService.get('RPC_URL'));
    // const coreContract = Core__factory.connect(coreContractAddr, provider);

    // const currentEpoch = await coreContract.currentEpoch();
    // console.log(currentEpoch.toString());
    return earliestNonClosedGame.epoch;
  }

  private _generatePermutations(numberPair: string): Array<string> {
    const numbers = numberPair.replace(/^0+/, '').split(''); //remove leading zeros if any
    const uniqueNumbers = new Set(numbers);

    const noOfPermutations = this._getPermutationCount(numberPair);
    return this._permutations(numbers, 4, noOfPermutations);
  }

  private _getPermutationCount(numberPair: string): number {
    const numbers = numberPair.replace(/^0+/, '').split(''); //remove leading zeros if any
    const uniqueNumbers = new Set(numbers);

    //TODO include the cases when less than 4 digits are included
    switch (uniqueNumbers.size) {
      case 4:
        return 24;
      case 3:
        return 12;
      case 2:
        return 6;
      case 1:
        return 4;
    }
  }

  //   private _generatePermutations(
  //     number: string,
  //     permutation: Permutations,
  //   ): Array<string> {
  //     const numbers = number.toString().split('');
  //     const result = [];

  //     if (permutation === Permutations.pairs_24) {
  //       result.push(...this._permutations(numbers, 4, 24));
  //     }

  //     if (permutation === Permutations.pairs_12) {
  //       result.push(...this._permutations(numbers, 4, 12));
  //     }

  //     if (permutation === Permutations.pairs_6) {
  //       result.push(...this._permutations(numbers, 4, 6));
  //     }

  //     if (permutation === Permutations.pairs_4) {
  //       result.push(...this._permutations(numbers, 4, 4));
  //     }

  //     return result;
  //   }

  private _permutations(letters, size, limit) {
    const results = [];
    for (let i = 0; i < letters.length; i++) {
      const res = letters[i];
      if (size === 1) {
        results.push(res);
        if (results.length === limit) return results; // Stop when limit is reached
      } else {
        const rest = this._permutations(
          letters,
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

  private async _betWithCredit(
    payload: BetOrder[],
    creditUsed: number,
    userSigner,
    provider,
  ) {
    const helperSigner = new Wallet(process.env.HELPER_BOT_PK, provider);

    const helperContract = Helper__factory.connect(
      this.configService.get('HELPER_CONTRACT'),
      helperSigner,
    );

    const bets = [];
    console.log(payload); //TODO delete
    payload.map((bet) => {
      const betAmount =
        bet.smallForecastAmount <= 0
          ? bet.bigForecastAmount
          : bet.smallForecastAmount;

      bets.push({
        epoch: bet.game.epoch,
        numberPair: bet.numberPair,
        amount: parseUnits(betAmount.toString(), 18),
        forecast: bet.smallForecastAmount <= 0 ? 1 : 0,
      });
    });

    const betWithCreditParams = {
      user: userSigner.address,
      bets,
      credit: parseUnits(creditUsed.toString(), 18),
    };

    const tx = await helperContract.betWithCredit(betWithCreditParams);

    return tx;
  }

  private async _betWithouCredit(payload: BetOrder[], userSigner, provider) {
    const coreContractAddr = this.configService.get('CORE_CONTRACT');
    const coreContract = Core__factory.connect(coreContractAddr, provider);

    const bets = [];
    payload.map((bet) => {
      const betAmount =
        bet.smallForecastAmount <= 0
          ? bet.bigForecastAmount
          : bet.smallForecastAmount;

      bets.push({
        epoch: bet.game.epoch,
        number: bet.numberPair,
        amount: parseUnits(betAmount.toString(), 18),
        forecast: bet.smallForecastAmount <= 0 ? 1 : 0,
      });
    });

    const tx = await coreContract
      .connect(userSigner)
      ['bet((uint256,uint256,uint256,uint8)[])'](bets);

    return tx;
  }

  @OnEvent('bet.submitTx', { async: true })
  async submitBetTx(payload: {
    betsPayload: BetOrder[];
    walletTx: WalletTx;
    gameUsdTx: GameUsdTx;
    creditBalanceUsed: number;
  }) {
    const provider = new JsonRpcProvider(this.configService.get('RPC_URL'));

    const userWallet = await this.walletRepository.findOne({
      where: {
        id: payload.walletTx.userWalletId,
      },
    });

    try {
      let tx = null;
      const userSigner = new Wallet(userWallet.privateKey, provider);

      try {
        if (payload.creditBalanceUsed > 0) {
          tx = await this._betWithCredit(
            payload.betsPayload,
            payload.creditBalanceUsed,
            userSigner,
            provider,
          );
        } else {
          console.log(`betting without credit`); //TODO delete
          tx = await this._betWithouCredit(
            payload.betsPayload,
            userSigner,
            provider,
          );
        }
      } catch (error) {
        console.error(
          `error sending gameUSDTx in bet.service for gameUDSTxId: ${payload.gameUsdTx.id}`,
        );
        console.error(error);

        payload.gameUsdTx.retryCount += 1;
        await this.gameUsdTxRepository.save(payload.gameUsdTx);
      }

      if (tx) {
        const txStatus = await provider.getTransactionReceipt(tx.hash);

        if (txStatus.status === 1) {
          await this.handleTxSuccess({
            tx,
            walletTx: payload.walletTx,
            gameUsdTx: payload.gameUsdTx,
          });
        } else {
          payload.gameUsdTx.retryCount += 1;
          await this.gameUsdTxRepository.save(payload.gameUsdTx);
        }
      }
    } catch (error) {
      console.error(error);
      //TODO add admin notification
    }
  }

  private async handleTxSuccess(payload: {
    tx: any;
    walletTx: WalletTx;
    gameUsdTx: GameUsdTx;
    // creditWalletTx: CreditWalletTx;
  }) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const lastValidWalletTx = await queryRunner.manager
        .createQueryBuilder(WalletTx, 'walletTx')
        .where(
          'walletTx.userWalletId = :userWalletId AND walletTx.status = :status',
          {
            userWalletId: payload.walletTx.userWalletId,
            status: 'S',
          },
        )
        .orderBy('walletTx.createdAt', 'DESC')
        .getOne();

      const lastValidCreditWalletTx = await queryRunner.manager
        .createQueryBuilder(CreditWalletTx, 'creditWalletTx')
        .where(
          'creditWalletTx.walletId = :walletId AND creditWalletTx.status = :status',
          {
            walletId: payload.walletTx.userWalletId,
            status: 's',
          },
        )
        .orderBy('creditWalletTx.createdAt', 'DESC')
        .getOne();
      payload.gameUsdTx.txHash = payload.tx.hash;
      payload.gameUsdTx.status = 'S';

      payload.walletTx.status = 'S';
      payload.walletTx.txHash = payload.tx.hash;
      payload.walletTx.startingBalance = lastValidWalletTx.endingBalance;
      payload.walletTx.endingBalance =
        lastValidWalletTx.endingBalance - payload.gameUsdTx.amount;

      const betOrders = payload.gameUsdTx.walletTx.betOrders;

      let previousEndingCreditBalance =
        lastValidCreditWalletTx.endingBalance || 0;
      for (let i = 0; i < betOrders.length; i++) {
        const currentCreditWalletTx = betOrders[i].creditWalletTx;
        currentCreditWalletTx.startingBalance = previousEndingCreditBalance;

        const endBalance =
          previousEndingCreditBalance - currentCreditWalletTx.amount;
        currentCreditWalletTx.endingBalance = endBalance;

        currentCreditWalletTx.status = 'S';
        await queryRunner.manager.save(currentCreditWalletTx);

        previousEndingCreditBalance = endBalance;
      }

      await queryRunner.manager.save(payload.walletTx);
      await queryRunner.manager.save(payload.gameUsdTx);

      const userWallet = await queryRunner.manager.findOne(UserWallet, {
        where: {
          id: payload.walletTx.userWalletId,
        },
      });

      userWallet.walletBalance = payload.walletTx.endingBalance;
      userWallet.creditBalance = previousEndingCreditBalance;
      userWallet.redeemableBalance -= payload.walletTx.txAmount;

      await queryRunner.manager.save(userWallet);

      const user = await queryRunner.manager.findOne(User, {
        where: {
          id: userWallet.userId,
        },
      });

      await this.handleReferralFlow(user.id, payload.walletTx.txAmount); //TODO

      await queryRunner.commitTransaction();
    } catch (error) {
      console.error(error);
      await queryRunner.rollbackTransaction();
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  private async handleReferralFlow(userId: number, depositAmount: number) {
    const queryRunner = this.dataSource.createQueryRunner();
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

      const commisionAmount =
        depositAmount * this.referralCommissionByRank(userInfo.referralRank);

      const walletTx = new WalletTx();
      walletTx.txType = 'REFERRAL';
      walletTx.txAmount = commisionAmount;
      walletTx.status = 'P';
      walletTx.userWalletId = userInfo.referralUserId;

      await queryRunner.manager.save(walletTx);

      const gameUsdTx = new GameUsdTx();
      gameUsdTx.amount = commisionAmount;
      gameUsdTx.status = 'P';
      gameUsdTx.retryCount = 0;
      gameUsdTx.chainId = +this.configService.get('GAMEUSD_CHAIN_ID');
      gameUsdTx.senderAddress = this.configService.get('GAMEUSD_POOL_ADDRESS');
      gameUsdTx.receiverAddress =
        userInfo.referralUser.referralUser.wallet.walletAddress;
      gameUsdTx.walletTx = walletTx;

      await queryRunner.manager.save(gameUsdTx);
    } catch (error) {
      console.error('Error in referral tx', error);
      await queryRunner.rollbackTransaction();
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  private async handleReferralGameUSDTx(gameUsdTx: GameUsdTx) {
    // const queryRunner = this.dataSource.createQueryRunner();
    // await queryRunner.connect();
    // await queryRunner.startTransaction();
    try {
      if (gameUsdTx.retryCount >= 5) {
        gameUsdTx.status = 'F';
        await this.gameUsdTxRepository.save(gameUsdTx);
        // await queryRunner.manager.save(gameUsdTx);
        return;
      }

      const provider = new JsonRpcProvider(this.configService.get('RPC_URL'));

      const gameUsdWallet = new Wallet(
        this.configService.get('DEPOSIT_BOT_PK'),
        provider,
      );

      const gameUsdContract = new Contract(
        this.configService.get('DEPOSIT_CONTRACT_ADDRESS'),
        [`function deposit(address user, uint256 amount) external`],
        gameUsdWallet,
      );

      const onchainGameUsdTx = await gameUsdContract.deposit(
        gameUsdTx.receiverAddress,
        parseUnits(gameUsdTx.amount.toString(), 18), //18 decimals for gameUSD
      );

      const receipt = onchainGameUsdTx.wait();
      if (receipt && receipt.status == 1) {
        const referrelTx = new ReferralTx();
        referrelTx.rewardAmount = gameUsdTx.amount;
        referrelTx.referralType = 'BET';
        referrelTx.walletTx = gameUsdTx.walletTx;

        gameUsdTx.status = 'S';
        gameUsdTx.txHash = onchainGameUsdTx.hash;

        gameUsdTx.walletTx.status = 'S';

        //select last walletTx of referrer
        const lastValidWalletTx = await this.walletTxRepository.findOne({
          where: {
            userWalletId: gameUsdTx.walletTx.userWalletId,
            status: 'S',
          },
          order: {
            updatedDate: 'DESC',
          },
        });

        gameUsdTx.walletTx.startingBalance = lastValidWalletTx.endingBalance;
        gameUsdTx.walletTx.endingBalance =
          lastValidWalletTx.endingBalance + gameUsdTx.walletTx.txAmount;

        await this.gameUsdTxRepository.save(gameUsdTx);
        await this.walletTxRepository.save(gameUsdTx.walletTx);

        const referrerWallet = await this.walletRepository.findOne({
          where: {
            id: gameUsdTx.walletTx.userWalletId,
          },
        });

        referrerWallet.walletBalance = gameUsdTx.walletTx.endingBalance;
        referrerWallet.redeemableBalance += gameUsdTx.amount; //commision amount
      } else {
        throw 'Game USD Tx Failed';
      }
    } catch (error) {
      console.error(error);
      gameUsdTx.retryCount += 1;
      await this.gameUsdTxRepository.save(gameUsdTx);
    }
  }

  isRetryCronRunning = false;
  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleRetryTxns() {
    if (this.isRetryCronRunning) return;
    this.isRetryCronRunning = true;

    const pendingGameUsdTx = await this.gameUsdTxRepository
      .createQueryBuilder('gameUsdTx')
      .leftJoinAndSelect('gameUsdTx.walletTx', 'walletTx')
      .leftJoinAndSelect('walletTx.betOrders', 'betOrders')
      .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
      .leftJoinAndSelect('betOrders.creditWalletTx', 'creditWalletTx')
      .where(
        'gameUsdTx.status = :gameStatus AND gameUsdTx.retryCount >= :retryCount',
        { gameStatus: 'P', retryCount: 1 },
      )
      .getMany();

    const provider = new JsonRpcProvider(this.configService.get('RPC_URL'));

    for (const gameUsdTx of pendingGameUsdTx) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      if (gameUsdTx.walletTx.txType == 'REFERRAL') {
        await this.handleReferralGameUSDTx(gameUsdTx);
        continue;
      }

      if (gameUsdTx.retryCount >= 5) {
        gameUsdTx.status = 'F';
        gameUsdTx.walletTx.status = 'F';

        await queryRunner.manager
          .createQueryBuilder()
          .update(CreditWalletTx)
          .set({ status: 'F' })
          .where('id IN (:...ids)', {
            ids: gameUsdTx.walletTx.betOrders.map(
              (betOrder) => betOrder.creditWalletTx.id,
            ),
          })
          .execute();

        await queryRunner.manager.save(gameUsdTx);
        await queryRunner.manager.save(gameUsdTx.walletTx);

        await queryRunner.commitTransaction();
        continue;
      }

      const walletTx = gameUsdTx.walletTx;
      const betOrders = gameUsdTx.walletTx.betOrders;
      try {
        const totalCreditsUsed = betOrders.reduce((acc, bet) => {
          if (bet.creditWalletTx) {
            acc += bet.creditWalletTx.amount;
          }
          return acc;
        }, 0);

        let tx = null;
        const userSigner = new Wallet(walletTx.userWallet.privateKey, provider);

        try {
          if (totalCreditsUsed > 0) {
            tx = await this._betWithCredit(
              betOrders,
              totalCreditsUsed,
              userSigner,
              provider,
            );
          } else {
            tx = await this._betWithouCredit(betOrders, userSigner, provider);
          }
        } catch (error) {
          console.error(error);
          gameUsdTx.retryCount += 1;
          await queryRunner.manager.save(gameUsdTx);
        }

        if (tx) {
          const txStatus = await provider.getTransactionReceipt(tx);
          if (txStatus.status && txStatus.status === 1) {
            gameUsdTx.status = 'S';
            await queryRunner.manager.save(gameUsdTx);

            await this.handleTxSuccess({
              tx,
              gameUsdTx,
              walletTx: gameUsdTx.walletTx,
            });
          } else if (txStatus.status && txStatus.status != 1) {
            gameUsdTx.retryCount += 1;
            await queryRunner.manager.save(gameUsdTx);
          }
        }
      } catch (error) {
        console.error(error);
        await queryRunner.rollbackTransaction();
      } finally {
        if (!queryRunner.isReleased) await queryRunner.release();
        this.isRetryCronRunning = false;
        //TODO add admin notification
      }
    }

    this.isRetryCronRunning = false;
  }
}
