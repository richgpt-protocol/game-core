/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ChatCompletionMessageParam } from 'openai/resources';
// import { SendMessageDto } from './dto/bet.dto';
// import { MongoClient, WithId } from 'mongodb'
import * as dotenv from 'dotenv';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import {
  In,
  Repository,
  DataSource,
  MoreThanOrEqual,
  LessThan,
  QueryRunner,
} from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BetDto, EstimateBetResponseDTO } from 'src/game/dto/Bet.dto';
import { Game } from './entities/game.entity';
import { DrawResult } from './entities/draw-result.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { RedeemTx } from 'src/wallet/entities/redeem-tx.entity';
import { BetOrder } from './entities/bet-order.entity';
import { ClaimDetail } from 'src/wallet/entities/claim-detail.entity';
import { ConfigService } from 'src/config/config.service';

import {
  Contract,
  JsonRpcProvider,
  MaxUint256,
  Wallet,
  parseUnits,
} from 'ethers';
import {
  Core__factory,
  GameUSDPool__factory,
  GameUSD__factory,
  Helper__factory,
} from 'src/contract';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { CreditWalletTx } from 'src/wallet/entities/credit-wallet-tx.entity';
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';
import { ReferralTx } from 'src/referral/entities/referral-tx.entity';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { PointService } from 'src/point/point.service';
import { UserService } from 'src/user/user.service';
import { ReloadTx } from 'src/wallet/entities/reload-tx.entity';

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
    @InjectRepository(ReloadTx)
    private reloadTxRepository: Repository<ReloadTx>,
    private configService: ConfigService,
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
    private readonly pointService: PointService,
    private readonly userService: UserService,
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

  async getRecentBets(count: number = 50) {
    try {
      const betsDb = await this.betRepository
        .createQueryBuilder('bet')
        .leftJoinAndSelect('bet.game', 'game')
        .leftJoinAndSelect('bet.walletTx', 'walletTx')
        .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
        .leftJoinAndSelect('userWallet.user', 'user')
        .orderBy('bet.id', 'DESC')
        .where('game.epoch = :epoch', { epoch: await this._getCurrentEpoch() })
        .andWhere('walletTx.status = :status', { status: 'S' })
        .limit(count)
        .getMany();

      if (betsDb.length === 0) return [];

      const bets = betsDb.map((bet) => {
        const phone = bet.walletTx.userWallet.user.phoneNumber;
        const maskedPhone =
          phone.slice(0, 3) + '****' + phone.slice(phone.length - 3);
        return {
          user: maskedPhone,
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
      console.error(error);
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
      console.error(error);
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
      const {
        creditRemaining,
        walletBalanceRemaining,
        walletBalanceUsed,
        creditBalanceUsed,
        creditWalletTxns,
      } = this.validateCreditAndBalance(userInfo, payload, betOrders);

      await queryRunner.manager.save(creditWalletTxns);
      walletTx.txAmount = walletBalanceUsed;
      walletTx.betOrders = betOrders;
      await queryRunner.manager.save(walletTx);
      await queryRunner.manager.save(betOrders);

      const gameUsdTx = new GameUsdTx();
      gameUsdTx.amount = walletBalanceUsed;
      gameUsdTx.status = 'P';
      gameUsdTx.walletTxs = [walletTx];
      gameUsdTx.walletTxId = walletTx.id;
      gameUsdTx.senderAddress = userInfo.wallet.walletAddress;
      gameUsdTx.receiverAddress = this.configService.get(
        'GAMEUSD_POOL_ADDRESS',
      );
      gameUsdTx.chainId = +this.configService.get('GAMEUSD_CHAIN_ID');
      gameUsdTx.retryCount = 0;

      await queryRunner.manager.save(gameUsdTx);

      await queryRunner.commitTransaction();

      await this.eventEmitter.emit(
        'gas.service.reload',
        userInfo.wallet.walletAddress,
        Number(process.env.OPBNB_CHAIN_ID),
      );

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

      if (error instanceof BadRequestException) {
        throw new BadRequestException(error.message);
      } else {
        throw new BadRequestException('Error in bet');
      }
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
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
    console.log(userInfo);
    const totalCredits = userInfo.wallet.creditBalance;
    const walletBalance = userInfo.wallet.walletBalance;

    const maxAllowedCreditAmount = this.configService.get('MAX_CREDIT_AMOUNT');
    let totalBetAmount = 0;
    let creditRemaining = totalCredits;
    let totalCreditUsed = 0;
    let walletBalanceUsed = 0;

    const creditWalletTxns = [];

    bets.forEach((bet) => {
      if (creditRemaining) {
        const betAmonut = bet.bigForecastAmount + bet.smallForecastAmount;
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
        // creditWalletTxn.campaignId = 0; //TODO

        creditWalletTxns.push(creditWalletTxn);

        bet.creditWalletTx = creditWalletTxn;
      } else {
        bet.creditWalletTx = null;
        totalBetAmount += +bet.bigForecastAmount + +bet.smallForecastAmount;
        walletBalanceUsed += +bet.bigForecastAmount + +bet.smallForecastAmount;
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
    if (numberPair.length < 4) {
      numberPair = numberPair.padStart(4, '0');
    } else if (numberPair.length > 4) {
      throw new BadRequestException('Invalid number pair');
    }

    console.log(`numberPair: ${numberPair}`);
    return this._permutations(numberPair, 4, 24);
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
      const coreContractAddr = this.configService.get('CORE_CONTRACT');
      const gmaeUsdContract = GameUSD__factory.connect(
        this.configService.get('GAMEUSD_CONTRACT_ADDRESS'),
        userSigner,
      );

      const allowance = await gmaeUsdContract.allowance(
        userSigner.address,
        coreContractAddr,
      );

      if (allowanceNeeded != BigInt(0) && allowance < allowanceNeeded) {
        const estimatedGasCost = await gmaeUsdContract
          .connect(userSigner)
          .approve.estimateGas(coreContractAddr, MaxUint256);
        const tx = await gmaeUsdContract
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

        // console.log(txStatus);

        if (txStatus.status === 1) {
          console.log('approved');
        } else {
          throw new Error('Error approving');
        }
      }
    } catch (error) {
      console.error(error);
      throw new Error('Error in approve');
    }
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

    let totalBetAmount = 0;
    const bets = [];
    payload.map((bet) => {
      if (bet.smallForecastAmount > 0) {
        bets.push({
          epoch: +bet.game.epoch,
          number: +bet.numberPair,
          amount: parseUnits(bet.smallForecastAmount.toString(), 18),
          forecast: 0,
        });

        totalBetAmount += +bet.smallForecastAmount;
      }

      if (bet.bigForecastAmount > 0) {
        bets.push({
          epoch: +bet.game.epoch,
          number: +bet.numberPair,
          amount: parseUnits(bet.bigForecastAmount.toString(), 18),
          forecast: 1,
        });

        totalBetAmount += +bet.bigForecastAmount;
      }
    });

    const betWithCreditParams = {
      user: userSigner.address,
      bets,
      credit: parseUnits(creditUsed.toString(), 18),
    };

    await this._checkAllowanceAndApprove(
      userSigner,
      parseUnits(totalBetAmount.toString(), 18),
    );

    const gasLimit = await helperContract
      .connect(userSigner)
      .betWithCredit.estimateGas(betWithCreditParams);
    const tx = await helperContract
      .connect(userSigner)
      .betWithCredit(betWithCreditParams, {
        gasLimit: gasLimit + (gasLimit * BigInt(30)) / BigInt(100),
      });

    this.eventEmitter.emit(
      'gas.service.reload',
      await helperSigner.getAddress(),
      Number(tx.chainId),
    );

    return tx;
  }

  private async _betWithoutCredit(payload: BetOrder[], userSigner, provider) {
    try {
      const coreContractAddr = this.configService.get('CORE_CONTRACT');
      const coreContract = Core__factory.connect(coreContractAddr, provider);

      console.log(`bet without credit`);

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

      // console.log(`approve`);
      await this._checkAllowanceAndApprove(
        userSigner,
        parseUnits(totalAmount.toString(), 18),
      );

      // console.log(`Approve done`);
      const gasLimit = await coreContract
        .connect(userSigner)
        ['bet((uint256,uint256,uint256,uint8)[])'].estimateGas(bets);

      const tx = await coreContract
        .connect(userSigner)
        ['bet((uint256,uint256,uint256,uint8)[])'](bets, {
          gasLimit: gasLimit + (gasLimit * BigInt(30)) / BigInt(100),
        });

      // console.log(`bet tx sent - waiting for confirmation`);
      this.eventEmitter.emit(
        'gas.service.reload',
        await userSigner.getAddress(),
        Number(tx.chainId),
      );

      await tx.wait();
      // console.log(`bet tx confirmed`);

      return tx;
    } catch (error) {
      console.error(error);
      throw new Error('Error in betWithoutCredit');
    }
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

      // Returns false if the user doesn't have enough balance and reload is pending
      const hasBalance = await this.checkNativeBalance(
        payload.walletTx.userWallet,
        payload.gameUsdTx.chainId,
      );
      // If its false, that means a reload might be pending.
      // So, process it in the handleRetryTxns() cron.
      if (!hasBalance) {
        // set retry count to 1 so that It will be picked up by the handleRetryTxns() cron
        payload.gameUsdTx.retryCount = 1;
        await this.gameUsdTxRepository.save(payload.gameUsdTx);
        return;
      }

      try {
        if (payload.creditBalanceUsed > 0) {
          tx = await this._betWithCredit(
            payload.betsPayload,
            payload.creditBalanceUsed,
            userSigner,
            provider,
          );
        } else {
          tx = await this._betWithoutCredit(
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
        .orderBy('walletTx.id', 'DESC')
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
        .orderBy('creditWalletTx.id', 'DESC')
        .getOne();
      payload.gameUsdTx.txHash = payload.tx.hash;
      payload.gameUsdTx.status = 'S';

      payload.walletTx.status = 'S';
      payload.walletTx.txHash = payload.tx.hash;
      payload.walletTx.startingBalance = lastValidWalletTx
        ? lastValidWalletTx.endingBalance
        : 0;
      payload.walletTx.endingBalance =
        payload.walletTx.startingBalance - payload.gameUsdTx.amount;

      const betOrders = payload.gameUsdTx.walletTxs
        .map((txn) => txn.betOrders)
        .flat();

      let previousEndingCreditBalance =
        lastValidCreditWalletTx?.endingBalance || 0;

      for (let i = 0; i < betOrders.length; i++) {
        const currentCreditWalletTx = betOrders[i].creditWalletTx;
        //ignore non credit tx
        if (currentCreditWalletTx) {
          currentCreditWalletTx.startingBalance = previousEndingCreditBalance;

          const endBalance = previousEndingCreditBalance
            ? previousEndingCreditBalance - currentCreditWalletTx.amount
            : currentCreditWalletTx.amount;
          currentCreditWalletTx.endingBalance = endBalance;

          currentCreditWalletTx.status = 'S';
          await queryRunner.manager.save(currentCreditWalletTx);

          previousEndingCreditBalance = endBalance;
        }
      }

      await queryRunner.manager.save(payload.gameUsdTx);

      const userWallet = await queryRunner.manager.findOne(UserWallet, {
        where: {
          id: payload.walletTx.userWalletId,
        },
      });

      const oldWalletBalance = userWallet.walletBalance;
      const nonRedeemableWalletBalance =
        oldWalletBalance - userWallet.redeemableBalance;

      if (payload.walletTx.txAmount > nonRedeemableWalletBalance) {
        userWallet.redeemableBalance -=
          payload.walletTx.txAmount - nonRedeemableWalletBalance;
      }

      userWallet.walletBalance = payload.walletTx.endingBalance;
      userWallet.creditBalance = previousEndingCreditBalance;

      const user = await queryRunner.manager.findOne(User, {
        where: {
          id: userWallet.userId,
        },
      });

      //Update Points
      const xpPoints = await this.pointService.getBetPoints(
        user.id,
        payload.gameUsdTx.amount,
      );
      const lastValidPointTx = await queryRunner.manager.findOne(PointTx, {
        where: {
          walletId: userWallet.id,
        },
        order: {
          id: 'DESC',
        },
      });
      const pointTx = new PointTx();
      pointTx.amount = xpPoints;
      pointTx.txType = 'BET';
      pointTx.walletId = userWallet.id;
      pointTx.userWallet = userWallet;
      pointTx.walletTx = payload.walletTx;
      pointTx.startingBalance = lastValidPointTx?.endingBalance || 0;
      pointTx.endingBalance =
        Number(pointTx.startingBalance) + Number(pointTx.amount);
      // pointTx.campaignId = ; //TODO

      userWallet.pointBalance = pointTx.endingBalance;

      await queryRunner.manager.save(payload.walletTx);
      await queryRunner.manager.save(userWallet);
      await queryRunner.manager.save(pointTx);

      await queryRunner.commitTransaction();

      await this.handleReferralFlow(user.id, payload.walletTx.txAmount);
    } catch (error) {
      console.error(error);
      await queryRunner.rollbackTransaction();
    } finally {
      await this.userService.setUserNotification(
        payload.walletTx.userWallet.userId,
        {
          type: 'bet',
          title: 'Buy Order Processed Successfully',
          message: 'Your Buy has been successfully processed',
          walletTxId: payload.walletTx.id,
        },
      );
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  private async handleReferralFlow(userId: number, betAmount: number) {
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
        betAmount * this.referralCommissionByRank(userInfo.referralRank);

      const walletTx = new WalletTx();
      walletTx.txType = 'REFERRAL';
      walletTx.txAmount = commisionAmount;
      walletTx.status = 'S';
      walletTx.userWalletId = userInfo.referralUserId;

      const lastValidWalletTx = await queryRunner.manager
        .createQueryBuilder(WalletTx, 'walletTx')
        .where(
          'walletTx.userWalletId = :userWalletId AND walletTx.status = :status',
          {
            userWalletId: walletTx.userWalletId,
            status: 'S',
          },
        )
        .orderBy('walletTx.id', 'DESC')
        .getOne();

      walletTx.startingBalance =
        lastValidWalletTx && lastValidWalletTx.endingBalance
          ? +lastValidWalletTx.endingBalance
          : 0;
      walletTx.endingBalance =
        lastValidWalletTx && lastValidWalletTx.endingBalance
          ? Number(lastValidWalletTx.endingBalance) + Number(walletTx.txAmount)
          : walletTx.txAmount;

      await queryRunner.manager.save(walletTx);

      const gameUsdTx = new GameUsdTx();
      gameUsdTx.amount = commisionAmount;
      gameUsdTx.status = 'S';
      gameUsdTx.retryCount = 0;
      gameUsdTx.chainId = +this.configService.get('GAMEUSD_CHAIN_ID');
      gameUsdTx.senderAddress = this.configService.get('GAMEUSD_POOL_ADDRESS');
      gameUsdTx.receiverAddress = userInfo.referralUser.wallet.walletAddress;
      gameUsdTx.walletTxs = [walletTx];
      gameUsdTx.walletTxId = walletTx.id;

      await queryRunner.manager.save(gameUsdTx);

      const referrelTx = new ReferralTx();
      referrelTx.rewardAmount = gameUsdTx.amount;
      referrelTx.referralType = 'BET';
      referrelTx.walletTx = walletTx;
      referrelTx.userId = userInfo.id;
      referrelTx.status = 'S';
      referrelTx.referralUserId = userInfo.referralUserId; //one who receives the referral amount

      //Update Referrer
      const referrerWallet = await queryRunner.manager.findOne(UserWallet, {
        where: {
          id: walletTx.userWalletId,
        },
      });

      referrerWallet.walletBalance = walletTx.endingBalance;
      referrerWallet.redeemableBalance =
        Number(referrerWallet.redeemableBalance) + Number(gameUsdTx.amount); //commision amount

      await this.updateReferrerXpPoints(
        queryRunner,
        userId,
        betAmount,
        referrerWallet,
        walletTx,
      );

      await queryRunner.manager.save(referrerWallet);
      await queryRunner.manager.save(referrelTx);

      await queryRunner.commitTransaction();
    } catch (error) {
      console.error('Error in referral tx', error);
      await queryRunner.rollbackTransaction();
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  async updateReferrerXpPoints(
    queryRunner: QueryRunner,
    user: number,
    betAmount: number,
    referrerWallet: UserWallet,
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
      user,
      betAmount,
    );
    referrerWallet.pointBalance =
      Number(referrerWallet.pointBalance) + referrerXPAmount;

    const pointTx = new PointTx();
    pointTx.amount = referrerXPAmount;
    pointTx.txType = 'REFERRAL';
    pointTx.walletId = referrerWallet.id;
    pointTx.userWallet = referrerWallet;
    pointTx.walletTx = walletTx;
    pointTx.startingBalance = lastValidPointTx?.endingBalance || 0;
    pointTx.endingBalance =
      Number(pointTx.startingBalance) + Number(pointTx.amount);
    referrerWallet.pointBalance = pointTx.endingBalance;

    await queryRunner.manager.save(pointTx);
  }

  /**
   *
   * @returns Whether the user has enough balance
   */
  private async checkNativeBalance(
    userWallet: UserWallet,
    chainId: number,
  ): Promise<boolean> {
    const provider = new JsonRpcProvider(this.configService.get('RPC_URL'));

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

  isRetryCronRunning = false;
  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleRetryTxns() {
    if (this.isRetryCronRunning) return;
    this.isRetryCronRunning = true;

    const pendingGameUsdTx = await this.gameUsdTxRepository
      .createQueryBuilder('gameUsdTx')
      .leftJoinAndSelect('gameUsdTx.walletTxs', 'walletTxs')
      .leftJoinAndSelect('walletTxs.betOrders', 'betOrders')
      .leftJoinAndSelect('walletTxs.userWallet', 'userWallet')
      .leftJoinAndSelect('betOrders.creditWalletTx', 'creditWalletTx')
      .leftJoinAndSelect('betOrders.game', 'game')
      .where(
        'gameUsdTx.status = :gameStatus AND gameUsdTx.retryCount >= :retryCount AND gameUsdTx.receiverAddress = :gameUsdPoolAddress',
        {
          gameStatus: 'P',
          retryCount: 1,
          gameUsdPoolAddress: this.configService.get('GAMEUSD_POOL_ADDRESS'),
        },
      )
      .andWhere('walletTxs.txType = :txType', { txType: 'PLAY' })
      .getMany();

    const provider = new JsonRpcProvider(this.configService.get('RPC_URL'));

    for (const gameUsdTx of pendingGameUsdTx) {
      try {
        console.log(`retrying gameUsdTx: ${gameUsdTx.id}`);
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        if (gameUsdTx.walletTxs[0].txType == 'REFERRAL') {
          // await this.handleReferralGameUSDTx(gameUsdTx);
          continue;
        }

        if (gameUsdTx.retryCount >= 5) {
          gameUsdTx.status = 'F';
          gameUsdTx.walletTxs[0].status = 'F';

          const creditTxnIds = gameUsdTx.walletTxs[0].betOrders
            .filter((betOrder) => betOrder.creditWalletTx)
            .map((betOrder) => betOrder.creditWalletTx.id);

          if (creditTxnIds.length > 0) {
            await queryRunner.manager
              .createQueryBuilder()
              .update(CreditWalletTx)
              .set({ status: 'F' })
              .where('id IN (:...ids)', {
                ids: creditTxnIds,
              })
              .execute();
          }

          await queryRunner.manager.save(gameUsdTx);
          await queryRunner.manager.save(gameUsdTx.walletTxs[0]);

          await queryRunner.commitTransaction();
          continue;
        }

        const walletTx = gameUsdTx.walletTxs[0];
        const betOrders = gameUsdTx.walletTxs[0].betOrders;

        // Returns false if the user doesn't have enough balance and reload is pending
        const hasBalance = await this.checkNativeBalance(
          walletTx.userWallet,
          gameUsdTx.chainId,
        );
        // If its false, that means a reload might be pending. So process it in next iteration.
        if (!hasBalance) continue;

        try {
          const totalCreditsUsed = betOrders.reduce((acc, bet) => {
            if (bet.creditWalletTx) {
              acc += bet.creditWalletTx.amount;
            }
            return acc;
          }, 0);

          let tx = null;
          const userSigner = new Wallet(
            walletTx.userWallet.privateKey,
            provider,
          );

          try {
            if (totalCreditsUsed > 0) {
              tx = await this._betWithCredit(
                betOrders,
                totalCreditsUsed,
                userSigner,
                provider,
              );
            } else {
              tx = await this._betWithoutCredit(
                betOrders,
                userSigner,
                provider,
              );
              console.log(`tx: ${tx}`);
              // tx = {
              //   hash: '0x123',
              // };
            }
          } catch (error) {
            console.error(error);
            gameUsdTx.retryCount += 1;
            await queryRunner.manager.save(gameUsdTx);
          }

          if (tx) {
            const txStatus = await provider.getTransactionReceipt(tx);
            if (txStatus.status && txStatus.status === 1) {
              // gameUsdTx.status = 'S';
              // await queryRunner.manager.save(gameUsdTx);

              await this.handleTxSuccess({
                tx,
                gameUsdTx,
                walletTx: gameUsdTx.walletTxs[0],
              });
            } else if (txStatus.status && txStatus.status != 1) {
              gameUsdTx.retryCount += 1;
              await queryRunner.manager.save(gameUsdTx);
              // await queryRunner.commitTransaction();
            }
          }

          await queryRunner.commitTransaction();
        } catch (error) {
          console.error(error);
          await queryRunner.rollbackTransaction();
        } finally {
          if (!queryRunner.isReleased) await queryRunner.release();
          this.isRetryCronRunning = false;
          //TODO add admin notification
        }
      } catch (error) {
        console.error(`error in retrying gameUsdTx: ${gameUsdTx.id}`);
        console.error(error);
      }
    }

    this.isRetryCronRunning = false;
  }
}
