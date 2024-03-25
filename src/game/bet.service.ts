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
import { Cron } from '@nestjs/schedule';
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

import { JsonRpcProvider, Wallet, parseUnits } from 'ethers';
import { Core__factory, Helper__factory } from 'src/contract';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { CreditWalletTx } from 'src/wallet/entities/credit-wallet-tx.entity';
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';

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
    private configService: ConfigService,
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
  ) {}

  async bet(userId: number, payload: BetDto[]): Promise<any> {
    const provider = new JsonRpcProvider(this.configService.get('RPC_URL'));
    const coreContractAddr = this.configService.get('CORE_CONTRACT');
    const coreContract = Core__factory.connect(coreContractAddr, provider);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const userInfo = await queryRunner.manager
        .createQueryBuilder(User, 'user')
        .leftJoinAndSelect('user.wallet', 'wallet')
        .where('user.id = :userId', { userId })
        .getOne();

      await this.validateBets(payload);

      const {
        creditRemaining,
        walletBalanceRemaining,
        walletBalanceUsed,
        creditBalanceUsed,
      } = this.validateCreditAndBalance(userInfo, payload);

      const walletTx = new WalletTx();
      walletTx.txType = 'DEPOSIT';
      walletTx.txAmount = walletBalanceUsed;
      walletTx.status = 'P';
      walletTx.userWalletId = userInfo.wallet.id;

      await queryRunner.manager.save(walletTx);

      let creditTx = null;
      if (creditBalanceUsed > 0) {
        creditTx = new CreditWalletTx();
        creditTx.txType = 'PLAY';
        creditTx.amount = creditBalanceUsed;
        creditTx.status = 'P';
        creditTx.walletId = userInfo.wallet.id;

        await queryRunner.manager.save(creditTx);
      }

      const betOrders = await this.createBetOrders(payload);

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

      await queryRunner.manager.save(gameUsdTx);
      await queryRunner.commitTransaction();

      await this.eventEmitter.emit('bet.submitTx', {
        payload,
        walletTx,
        gameUsdTx,
        creditWalletTx: creditTx,
        creditBalanceUsed,
      });
    } catch (error) {
      console.error(error);
      await queryRunner.rollbackTransaction();
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
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
        game: In(allGamesArr),
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
  }

  private validateCreditAndBalance(
    userInfo: User,
    payload: BetDto[],
  ): {
    creditRemaining: number;
    walletBalanceRemaining: number;
    walletBalanceUsed: number;
    creditBalanceUsed: number;
  } {
    const totalCredits = userInfo.wallet.creditBalance;
    const walletBalance = userInfo.wallet.walletBalance;

    const maxAllowedCreditAmount = this.configService.get('MAX_CREDIT_AMOUNT');
    let totalBetAmount = 0;
    let creditRemaining = totalCredits;
    let totalCreditUsed = 0;
    if (totalCredits && +maxAllowedCreditAmount) {
      payload.forEach((bet) => {
        const betCount =
          this._getPermutationCount(bet.numberPair.padStart(4, '0')) *
          bet.epochs.length;
        const betAmountPerEpoch = bet.isPermutation
          ? (bet.bigForecastAmount + bet.smallForecastAmount) * betCount
          : bet.bigForecastAmount + bet.smallForecastAmount;

        const betAmount = betAmountPerEpoch * bet.epochs.length;

        const maximumCreditAmountNeeded = betCount * +maxAllowedCreditAmount;
        totalBetAmount += betAmount;

        //enough credits
        if (creditRemaining >= maximumCreditAmountNeeded) {
          totalCreditUsed +=
            betAmount > maximumCreditAmountNeeded
              ? maximumCreditAmountNeeded
              : betAmount;
          creditRemaining -=
            betAmount > maximumCreditAmountNeeded
              ? maximumCreditAmountNeeded
              : betAmount;
        } else if (creditRemaining > 0) {
          totalCreditUsed += creditRemaining;
          creditRemaining = 0;
        } else {
          // creditRemaining is zero
        }
      });
    }

    const walletBalanceUsed = totalBetAmount - totalCreditUsed;

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

  private async createBetOrders(payload: BetDto[]): Promise<Array<BetOrder>> {
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

          betOrders.push(betOrder);
        });
      });
    });

    return betOrders;
  }

  private async _getCurrentEpoch() {
    const coreContractAddr = this.configService.get('CORE_CONTRACT');
    const provider = new JsonRpcProvider(this.configService.get('RPC_URL'));
    const coreContract = Core__factory.connect(coreContractAddr, provider);

    const currentEpoch = await coreContract.currentEpoch();
    console.log(currentEpoch.toString());
    return currentEpoch;
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
    payload: BetDto[],
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
    payload.map((bet) => {
      const betAmount =
        bet.smallForecastAmount <= 0
          ? bet.bigForecastAmount
          : bet.smallForecastAmount;

      bet.epochs.map((epoch) => {
        bets.push({
          epoch,
          numberPair: bet.numberPair,
          amount: parseUnits(betAmount.toString(), 18),
          forecast: bet.smallForecastAmount <= 0 ? 1 : 0,
        });
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

  private async _betWithouCredit(payload: BetDto[], userSigner, provider) {
    const coreContractAddr = this.configService.get('CORE_CONTRACT');
    const coreContract = Core__factory.connect(coreContractAddr, provider);

    const bets = [];
    payload.map((bet) => {
      const betAmount =
        bet.smallForecastAmount <= 0
          ? bet.bigForecastAmount
          : bet.smallForecastAmount;

      bet.epochs.map((epoch) => {
        bets.push({
          epoch,
          numberPair: bet.numberPair,
          amount: parseUnits(betAmount.toString(), 18),
          forecast: bet.smallForecastAmount <= 0 ? 1 : 0,
        });
      });
    });

    const tx = await coreContract
      .connect(userSigner)
      ['bet((uint256,uint256,uint256,uint8)[])'](bets);

    return tx;
  }

  @OnEvent('bet.submitTx', { async: true })
  async submitBetTx(payload: {
    betsPayload: BetDto[];
    walletTx: WalletTx;
    gameUsdTx: GameUsdTx;
    creditWalletTx: CreditWalletTx;
    creditBalanceUsed: number;
  }) {
    const provider = new JsonRpcProvider(this.configService.get('RPC_URL'));

    try {
      let tx = null;
      const userSigner = new Wallet(
        payload.walletTx.userWallet.privateKey,
        provider,
      );
      if (payload.creditBalanceUsed > 0) {
        tx = await this._betWithCredit(
          payload.betsPayload,
          payload.creditBalanceUsed,
          userSigner,
          provider,
        );
      } else {
        tx = await this._betWithouCredit(
          payload.betsPayload,
          userSigner,
          provider,
        );
      }

      if (tx) {
        const txStatus = await provider.getTransactionReceipt(tx.hash);

        if (txStatus.status === 1) {
          await this.handleTxSuccess({
            tx,
            walletTx: payload.walletTx,
            gameUsdTx: payload.gameUsdTx,
            creditWalletTx: payload.creditWalletTx,
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
    creditWalletTx: CreditWalletTx;
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
        lastValidWalletTx.endingBalance + payload.gameUsdTx.amount;

      payload.creditWalletTx.startingBalance =
        lastValidCreditWalletTx.endingBalance;
      payload.creditWalletTx.endingBalance =
        lastValidCreditWalletTx.endingBalance - payload.creditWalletTx.amount;
      payload.creditWalletTx.status = 'S';

      await queryRunner.manager.save(payload.walletTx);
      await queryRunner.manager.save(payload.gameUsdTx);
      await queryRunner.manager.save(payload.creditWalletTx);

      const userWallet = await queryRunner.manager.findOne(UserWallet, {
        where: {
          id: payload.walletTx.userWalletId,
        },
      });

      userWallet.walletBalance += payload.walletTx.endingBalance;
      userWallet.creditBalance = payload.creditWalletTx.endingBalance;
      userWallet.redeemableBalance -= payload.walletTx.txAmount;

      await queryRunner.manager.save(userWallet);

      await queryRunner.commitTransaction();
    } catch (error) {
      console.error(error);
      await queryRunner.rollbackTransaction();
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  isRetryCronRunning = false;
  @Cron('*/10 * * * * *')
  private async handleRetryTxns() {
    if (this.isRetryCronRunning) return;
    this.isRetryCronRunning = true;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const pendingGameUsdTx = await queryRunner.manager
        .createQueryBuilder(GameUsdTx, 'gameUsdTx')
        .leftJoinAndSelect(
          WalletTx,
          'walletTx',
          'walletTx.id = gameUsdTx.walletTxId',
        )
        .leftJoinAndSelect(
          CreditWalletTx,
          'creditWalletTx',
          'creditWalletTx.walletId = walletTx.userWalletId AND creditWalletTx.status = :status',
          { status: 'P' },
        )
        .where(
          'gameUsdTx.status = :gameStatus AND gameUsdTx.retryCount >= :retryCount',
          { gameStatus: 'P', retryCount: MoreThanOrEqual(1) },
        )
        .getMany();

      for (const gameUsdTx of pendingGameUsdTx) {
        if (gameUsdTx.retryCount >= 5) {
          gameUsdTx.status = 'F';
          await queryRunner.manager.save(gameUsdTx);
          continue;
        }

        const provider = new JsonRpcProvider(this.configService.get('RPC_URL'));

        const walletTx = gameUsdTx.walletTx;
        const creditWalletTx = gameUsdTx.walletTx;

        // let tx = null;
        // const userSigner = new Wallet(
        //   payload.walletTx.userWallet.privateKey,
        //   provider,
        // );
        // if (payload.creditBalanceUsed > 0) {
        //   tx = await this._betWithCredit(
        //     payload.betsPayload,
        //     payload.creditBalanceUsed,
        //     userSigner,
        //     provider,
        //   );
        // } else {
        //   tx = await this._betWithouCredit(
        //     payload.betsPayload,
        //     userSigner,
        //     provider,
        //   );
        // }

        const txStatus = await provider.getTransactionReceipt(gameUsdTx.txHash);

        if (txStatus.status === 1) {
          gameUsdTx.status = 'S';
          await queryRunner.manager.save(gameUsdTx);
        } else {
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

    this.isRetryCronRunning = false;
  }
}
