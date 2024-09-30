import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Admin } from 'src/admin/entities/admin.entity';
import { BetOrder } from 'src/game/entities/bet-order.entity';
import { DrawResult } from 'src/game/entities/draw-result.entity';
import { Game } from 'src/game/entities/game.entity';
import { PrizeAlgo } from 'src/game/entities/prize-algo.entity';
import { User } from 'src/user/entities/user.entity';
import { DepositTx } from 'src/wallet/entities/deposit-tx.entity';
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { ClaimService } from 'src/wallet/services/claim.service';
import { WalletService } from 'src/wallet/wallet.service';
import { Between, In, Repository } from 'typeorm';

@Injectable()
export class BackOfficeService {
  private readonly logger = new Logger(BackOfficeService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserWallet)
    private userWalletRepository: Repository<UserWallet>,
    @InjectRepository(Admin)
    private adminRepository: Repository<Admin>,
    @InjectRepository(WalletTx)
    private walletTxRepository: Repository<WalletTx>,
    @InjectRepository(DepositTx)
    private depositTxRepository: Repository<DepositTx>,
    @InjectRepository(GameUsdTx)
    private gameUsdTxRepository: Repository<GameUsdTx>,
    @InjectRepository(BetOrder)
    private betOrderRepository: Repository<BetOrder>,
    @InjectRepository(Game)
    private gameRepository: Repository<Game>,
    @InjectRepository(DrawResult)
    private drawResultRepository: Repository<DrawResult>,
    @InjectRepository(PrizeAlgo)
    private prizeAlgoRepository: Repository<PrizeAlgo>,
    private walletService: WalletService,
    private claimService: ClaimService,
  ) {}

  async getUsers(page: number = 1, limit: number = 10): Promise<any> {
    try {
      const data = await this.userRepository
        .createQueryBuilder('user')
        .select([
          'user.phoneNumber',
          'user.id',
          'user.createdDate',
          'user.isMobileVerified',
          'user.emailAddress',
          'user.status',
          'wallet.walletAddress',
        ])
        .leftJoin('user.wallet', 'wallet')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      console.log(data);

      const users = data[0];

      const userInfo = users.map((user) => {
        const walletAddress = user.wallet?.walletAddress || '';
        delete user.wallet;
        return {
          ...user,
          walletAddress,
          createdDate: user.createdDate.toLocaleDateString(),
        };
      });

      return {
        data: userInfo,
        currentPage: page,
        totalPages: Math.ceil(data[1] / limit),
      };
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Internal Server Error');
    }
  }

  async getWallets(page: number = 1, limit: number = 10): Promise<any> {
    try {
      const wallets = await this.userWalletRepository.findAndCount({
        select: [
          'user',
          'walletBalance',
          'creditBalance',
          'pointBalance',
          'walletAddress',
        ],
        skip: (page - 1) * limit,
        take: limit,
      });

      const walletsInfo = wallets[0].map((wallet) => {
        console.log(wallet);
        return {
          ...wallet,
          walletBalance: (+wallet.walletBalance).toFixed(2),
          creditBalance: (+wallet.creditBalance).toFixed(2),
          pointBalance: (+wallet.pointBalance).toFixed(2),
        };
      });

      return {
        data: walletsInfo,
        currentPage: page,
        totalPages: Math.ceil(wallets[1] / limit),
      };
    } catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException('Internal Server Error');
    }
  }

  async getStaffs(page: number = 1, limit: number = 10): Promise<any> {
    try {
      const data = await this.adminRepository.findAndCount({
        select: [
          'id',
          'username',
          'name',
          'emailAddress',
          'adminType',
          'createdDate',
          'status',
          'createdBy',
        ],
        skip: (page - 1) * limit,
        take: limit,
      });

      console.log(data);

      return {
        data: data[0],
        currentPage: page,
        totalPages: Math.ceil(data[1] / limit),
      };
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Internal Server Error');
    }
  }

  async getUserPoints(page: number = 1, limit: number = 10): Promise<any> {
    try {
      const wallets = await this.userWalletRepository
        .createQueryBuilder('userWallet')
        .select([
          'userWallet.id',
          // 'userWallet.user',
          'userWallet.walletBalance',
          'userWallet.creditBalance',
          'userWallet.pointBalance',
          'userWallet.walletAddress',
        ])
        .leftJoin('userWallet.user', 'user')
        .addSelect('user.uid')
        .orderBy('userWallet.pointBalance', 'DESC')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      console.log(wallets[0]);

      const data = wallets[0].map((wallet) => {
        const level = this.walletService.calculateLevel(wallet.pointBalance);
        return {
          ...wallet,
          walletBalance: (+wallet.walletBalance).toFixed(2),
          pointBalance: (+wallet.pointBalance).toFixed(2),
          level: Math.trunc(level),
        };
      });

      console.log(data);

      return {
        data,
        currentPage: page,
        totalPages: Math.ceil(wallets[1] / limit),
      };
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Internal Server Error');
    }
  }

  async getPendingWithdraw(page: number = 1, limit: number = 10): Promise<any> {
    try {
      const data = await this.walletTxRepository
        .createQueryBuilder('walletTx')
        .select([
          'walletTx.id',
          'walletTx.txType',
          'walletTx.txAmount',
          'walletTx.status',
          'walletTx.createdDate',
          'walletTx.userWalletId',
          'walletTx.redeemTx',
          'userWallet.walletAddress',
          'userWallet.userId',
        ])
        .leftJoin('walletTx.userWallet', 'userWallet')
        .leftJoinAndSelect('walletTx.redeemTx', 'redeemTx')
        .where('walletTx.txType = :type', { type: 'REDEEM' })
        .andWhere('walletTx.status = :status', { status: 'PA' })
        .orderBy('walletTx.createdDate', 'DESC')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      const transactions = data[0].map((tx) => {
        return {
          ...tx,
          createdDate: tx.createdDate.toLocaleDateString(),
        };
      });

      console.log(transactions);

      return {
        data: transactions,
        currentPage: page,
        totalPages: Math.ceil(data[1] / limit),
      };
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Internal Server Error');
    }
  }

  async getTransactions(page: number = 1, limit: number = 10): Promise<any> {
    try {
      const data = await this.walletTxRepository
        .createQueryBuilder('walletTx')
        .select([
          'walletTx.id',
          'walletTx.txType',
          'walletTx.txAmount',
          'walletTx.status',
          'walletTx.createdDate',
          'walletTx.userWalletId',
          'userWallet.walletAddress',
          'userWallet.userId',
        ])
        .leftJoin('walletTx.userWallet', 'userWallet')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      const transactions = data[0].map((tx) => {
        return {
          ...tx,
          createdDate: tx.createdDate.toLocaleDateString(),
        };
      });

      console.log(transactions);

      return {
        data: transactions,
        currentPage: page,
        totalPages: Math.ceil(data[1] / limit),
      };
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Internal Server Error');
    }
  }

  async getUserGrowth(startDate: Date, endDate: Date): Promise<any> {
    const users = await this.userRepository.find({
      where: {
        createdDate: Between(startDate, endDate),
      },
    });

    const userCount = {};
    const start = startDate;
    while (start < endDate) {
      userCount[start.toDateString()] = 0;
      start.setDate(start.getDate() + 1);
    }

    users.forEach((user) => {
      const date = user.createdDate.toDateString();
      userCount[date] += 1;
    });

    return userCount;
  }

  async getPastDrawResults(page: number = 1, limit: number = 10) {
    const games = await this.gameRepository.findAndCount({
      where: {
        isClosed: true,
      },
      select: ['id', 'epoch'],
      order: {
        epoch: 'DESC',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    const results = await this.drawResultRepository.find({
      where: {
        gameId: In(games[0].map((game) => game.id)),
      },
      select: ['id', 'numberPair', 'prizeCategory', 'prizeIndex', 'gameId'],
    });

    const resultByGameId = results.reduce((acc, result) => {
      const epoch = games[0].find((game) => game.id === result.gameId).epoch;
      if (!acc[epoch]) {
        acc[epoch] = [];
      }

      acc[epoch].push(result);

      return acc;
    }, {});

    //resultByGameId = { gameId: [drawResult1, drawResult2, ...] }
    return {
      data: resultByGameId,
      currentPage: page,
      totalPages: Math.ceil(games[1] / limit),
    };
  }

  async getCreditWalletTxns(
    page: number = 1,
    limit: number = 10,
  ): Promise<any> {
    try {
      const data = await this.walletTxRepository
        .createQueryBuilder('walletTx')
        .select([
          'walletTx.id',
          'walletTx.txType',
          'walletTx.amount',
          'walletTx.status',
          'walletTx.createdDate',
          'walletTx.userWalletId',
          'userWallet.walletAddress',
          'userWallet.userId',
        ])
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      const transactions = data[0].map((tx) => {
        return {
          ...tx,
          createdDate: tx.createdDate.toLocaleDateString(),
        };
      });

      console.log(transactions);

      return {
        data: transactions,
        currentPage: page,
        totalPages: Math.ceil(data[1] / limit),
      };
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Internal Server Error');
    }
  }

  async getReferralListing(page: number = 1, limit: number = 10): Promise<any> {
    const all = await this.userRepository.findAndCount({
      select: ['id', 'referralUserId'],
      skip: (page - 1) * limit,
      take: limit,
    });

    const allReferrers = all[0]
      .filter((user) => user.referralUserId)
      .map((user) => {
        return user.referralUserId;
      });

    const commission = await this.walletTxRepository
      .createQueryBuilder('walletTx')
      .select('walletTx.userWalletId', 'userWalletId')
      .addSelect('SUM(walletTx.txAmount)', 'totalCommission')
      .leftJoin('walletTx.userWallet', 'userWallet')
      .where('walletTx.txType = :type', { type: 'REFERRAL' })
      .andWhere('walletTx.userWalletId IN (:...ids)', {
        ids: allReferrers,
      })
      .andWhere('walletTx.status = :status', { status: 'S' })
      .groupBy('walletTx.userWalletId')
      .getRawMany();

    const referrers = await this.userRepository.find({
      select: ['id', 'phoneNumber', 'createdDate', 'referralCode'],
      where: {
        id: In(allReferrers),
      },
    });
    const referrees = await this.userRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.phoneNumber',
        'user.createdDate',
        'user.referralCode',
        'user.referralUserId',
      ])
      .leftJoinAndSelect('user.wallet', 'wallet')
      .where('user.referralUserId IN (:...ids)', {
        ids: allReferrers,
      })
      .getMany();

    const deposits = await this.depositTxRepository
      .createQueryBuilder('depositTx')
      .leftJoinAndSelect('depositTx.walletTx', 'walletTx')
      .where('depositTx.status = :status', { status: 'S' })
      .andWhere('depositTx.receiverAddress IN (:...addresses)', {
        addresses: referrees.map((user) => user.wallet.walletAddress),
      })
      .getMany();

    // const depositsByUserId = await this.depositTxRepository.find({
    //   select: ['userWalletId', 'txAmount'],
    //   where: {
    //     status: 'S',
    //     receiverAddress: In(referrees.map((user) => user.wallet.walletAddress)),
    //   },
    // });

    // const bettingAmountByUserId = await this.walletTxRepository.find({
    //   select: ['userWalletId', 'txAmount'],
    //   where: {
    //     txType: 'PLAY',
    //     userWalletId: In(referrees.map((user) => user.wallet.id)),
    //   },
    // });

    const bettingAmountByUserId = await this.gameUsdTxRepository
      .createQueryBuilder('gameUsdTx')
      .select('gameUsdTx.userWalletId', 'userWalletId')
      .addSelect('SUM(gameUsdTx.txAmount)', 'totalBettingAmount')
      .where('gameUsdTx.userWalletId IN (:...ids)', {
        ids: referrees.map((user) => user.wallet.id),
      })
      .groupBy('gameUsdTx.userWalletId')
      .getRawMany();

    const result = referrers.map((referrer) => {
      return {
        referrerId: referrer.id,
        phoneNumber: referrer.phoneNumber,
        createdDate: referrer.createdDate.toLocaleDateString(),
        referralCode: referrer.referralCode,
        commission: commission.find(
          (commission) => commission.userWalletId === referrer.id,
        )?.totalCommission,

        referrees: referrees
          .filter((referree) => referree.referralUserId === referrer.id)
          .map((referree) => {
            return {
              referreeId: referree.id,
              phoneNumber: referree.phoneNumber,
              createdDate: referree.createdDate.toLocaleDateString(),
              referralCode: referree.referralCode,
              deposits: deposits
                .filter(
                  (tx) => tx.receiverAddress === referree.wallet.walletAddress,
                )
                .reduce((acc, tx) => acc + +tx.walletTx.txAmount, 0),
              // deposits: depositsByUserId
              //   .filter((tx) => tx.userWalletId === referree.wallet.id)
              //   .reduce((acc, tx) => acc + +tx.txAmount, 0),
              bettingAmount: bettingAmountByUserId
                .filter((tx) => tx.userWalletId === referree.wallet.id)
                .reduce((acc, tx) => acc + +tx.txAmount, 0),
            };
          }),
      };
    });

    return {
      data: result,
      currentPage: page,
      totalPages: Math.ceil(all[1] / limit),
    };
  }

  async bettingListing(
    startDate: Date,
    endDate: Date,
    page: number = 1,
    limit: number = 10,
  ): Promise<any> {
    const totalBetOrdersCount = await this.betOrderRepository
      .createQueryBuilder('betOrder')
      .where('betOrder.createdDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .getCount();

    const betOrders = await this.betOrderRepository
      .createQueryBuilder('betOrder')
      .addSelect(['numberPair', 'bigForecastAmount', 'smallForecastAmount'])
      .leftJoinAndSelect('betOrder.walletTx', 'walletTx')
      .leftJoinAndSelect('betOrder.game', 'game')
      .where('betOrder.createdDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    const betsByDate = betOrders.reduce((acc, betOrder) => {
      const date = betOrder.createdDate.toDateString();
      if (!acc[date]) {
        acc[date] = [];
      }

      const index = acc[date].findIndex(
        (bet) => bet.numberPair === betOrder.numberPair,
      );
      if (index != -1) {
        acc[date][index].bigForecastAmount += +betOrder.bigForecastAmount;
        acc[date][index].smallForecastAmount += +betOrder.smallForecastAmount;
        acc[date][index].betCount += 1;
        return acc;
      } else {
        acc[date].push({
          numberPair: betOrder.numberPair,
          bigForecastAmount: betOrder.bigForecastAmount,
          smallForecastAmount: betOrder.smallForecastAmount,
          betCount: 1,
        });
      }
      return acc;
    }, {});

    console.log(betsByDate);

    return {
      data: betsByDate,
      currentPage: page,
      totalPages: Math.ceil(totalBetOrdersCount / limit),
    };
  }

  async salesReport(startDate: string, endDate: string) {
    const betOrders = await this.betOrderRepository
      .createQueryBuilder('betOrder')
      .leftJoinAndSelect('betOrder.walletTx', 'walletTx')
      .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
      .leftJoinAndSelect('betOrder.claimDetail', 'claimDetail')
      .where('betOrder.createdDate BETWEEN :startDate AND :endDate', {
        // need to pass as string instead of Date object because of the timezone issue
        startDate,
        endDate,
      })
      .andWhere('walletTx.status = :status', { status: 'S' })
      .getManyAndCount();

    const commissions = await this.walletTxRepository
      .createQueryBuilder('walletTx')
      .select('txAmount')
      .addSelect('createdDate')
      .where('walletTx.txType = :type', { type: 'REFERRAL' })
      .andWhere('walletTx.createdDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .getRawMany();

    const resultByDate = {};
    const start = new Date(startDate);
    while (start < new Date(endDate)) {
      resultByDate[start.toDateString()] = {
        totalBetAmount: 0,
        betCount: 0,
        userCount: 0,
        totalPayout: 0,
        totalPayoutRewards: 0,
        commissionAmount: Number(
          commissions.find(
            (_commision) =>
              _commision.createdDate.toDateString() === start.toDateString(),
          )?.txAmount || 0,
        ),
      };
      start.setDate(start.getDate() + 1);
    }

    const userByDate = {};
    betOrders[0].map((betOrder) => {
      const date = betOrder.createdDate.toDateString();
      if (!userByDate[date]) {
        userByDate[date] = new Set();
      }

      resultByDate[date].totalBetAmount =
        Number(resultByDate[date].totalBetAmount) +
        Number(betOrder.bigForecastAmount) +
        Number(betOrder.smallForecastAmount);
      resultByDate[date].betCount += 1;
      resultByDate[date].userCount += userByDate[date].has(
        betOrder.walletTx.userWallet.userId,
      )
        ? 0
        : 1;
      userByDate[date].add(betOrder.walletTx.userWallet.userId);

      if (betOrder.claimDetail) {
        resultByDate[date].totalPayoutRewards =
          Number(resultByDate[date].totalPayoutRewards) +
          (Number(betOrder.claimDetail.claimAmount) || 0) +
          (Number(betOrder.claimDetail.bonusAmount) || 0);

        resultByDate[date].totalPayout =
          Number(resultByDate[date].totalPayout) +
            Number(betOrder.claimDetail.claimAmount) || 0;
      }
    });

    return {
      data: resultByDate,
    };
  }

  async salesReportByEpoch(epoch: number) {
    const betOrders = await this.betOrderRepository
      .createQueryBuilder('betOrder')
      .leftJoinAndSelect('betOrder.walletTx', 'walletTx')
      .leftJoinAndSelect('betOrder.creditWalletTx', 'creditWalletTx')
      .leftJoinAndSelect('betOrder.game', 'game')
      .where('game.epoch = :epoch', { epoch })
      .getMany();

    if (betOrders.length === 0) {
      // no bet in this epoch
      return {
        data: null,
      };
    }

    const drawResults = await this.drawResultRepository.find({
      where: {
        gameId: betOrders[0].gameId,
      },
    });

    if (drawResults.length === 0) {
      // draw result for this epoch haven't come out yet
      return {
        data: null,
      };
    }

    let result = {
      totalBetUser: 0,
      totalBetCount: 0,
      totalBetAmount: 0,
      totalCreditUsed: 0,
      totalWinCount: 0,
      totalWinAmount: 0,
      totalProfit: 0,
      category: {
        first: { count: 0, amount: 0 },
        second: { count: 0, amount: 0 },
        third: { count: 0, amount: 0 },
        special: { count: 0, amount: 0 },
        consolation: { count: 0, amount: 0 },
      },
    };

    let totalBetUser = new Set();
    for (const betOrder of betOrders) {
      totalBetUser.add(betOrder.walletTx.userWalletId);
      result.totalBetCount += 1;
      const betAmount = Number(betOrder.bigForecastAmount) + Number(betOrder.smallForecastAmount);
      result.totalBetAmount += betAmount;
      result.totalCreditUsed += betOrder.creditWalletTx ? Number(betOrder.creditWalletTx.amount) : 0;
      result.totalWinCount += betOrder.availableClaim ? 1 : 0;
      if (betOrder.availableClaim) {
        const { winAmount, prizeCategory } = this.getWinAmountAndPrizeCategory(betOrder, drawResults);
        result.totalWinAmount += winAmount;
        result.totalProfit += betAmount - winAmount;
        if (prizeCategory === '1') {
          result.category.first.count += 1;
          result.category.first.amount += winAmount;
        } else if (prizeCategory === '2') {
          result.category.second.count += 1;
          result.category.second.amount += winAmount;
        } else if (prizeCategory === '3') {
          result.category.third.count += 1;
          result.category.third.amount += winAmount;
        } else if (prizeCategory === 'S') {
          result.category.special.count += 1;
          result.category.special.amount += winAmount;
        } else if (prizeCategory === 'C') {
          result.category.consolation.count += 1;
          result.category.consolation.amount += winAmount;
        }
      } else {
        result.totalProfit += betAmount;
      }
    }

    result.totalBetUser = totalBetUser.size;

    return {
      data: result,
    };
  }

  private getWinAmountAndPrizeCategory(betOrder: BetOrder, drawResults: DrawResult[]): { winAmount: number, prizeCategory: string } {
    const drawResult = drawResults.find(
      (drawResult) => drawResult.numberPair === betOrder.numberPair,
    );
    // drawResult must not null because betOrder.availableClaim is true in parent function
    const winAmount = this.claimService.calculateWinningAmount(betOrder, drawResult);
    return {
      winAmount: winAmount.bigForecastWinAmount + winAmount.smallForecastWinAmount,
      prizeCategory: drawResult.prizeCategory,
    }
  }

  async getCurrentPrizeAlgo() {
    const prizeAlgo = await this.prizeAlgoRepository.find();

    const game = await this.gameRepository.findOne({
      where: { isClosed: false },
    });

    return {
      data: prizeAlgo,
      currentEpoch: game.epoch,
    };
  }

  async updatePrizeAlgo(
    adminId: number,
    prizeAlgos: Array<{ key: string; value: any }>,
  ) {
    const existingPrizeAlgos = await this.prizeAlgoRepository.find();

    const prizeAlgoMap = new Map(prizeAlgos.map((item) => [item.key, item]));

    for (const existingPrizeAlgo of existingPrizeAlgos) {
      const newPrizeAlgo = prizeAlgoMap.get(existingPrizeAlgo.key);
      if (newPrizeAlgo) {
        if (existingPrizeAlgo.value !== newPrizeAlgo.value) {
          existingPrizeAlgo.value = newPrizeAlgo.value;
          existingPrizeAlgo.updatedBy = adminId;
        }
      } else {
        throw new InternalServerErrorException(
          `Prize Algo with key ${existingPrizeAlgo.key} not found in the new prizeAlgos`,
        );
      }
    }

    // existingPrizeAlgos is replaced with the updated prizeAlgos
    await this.prizeAlgoRepository.save(existingPrizeAlgos);
  }
}
