import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Admin } from 'src/admin/entities/admin.entity';
import { BetOrder } from 'src/game/entities/bet-order.entity';
import { User } from 'src/user/entities/user.entity';
import { DepositTx } from 'src/wallet/entities/deposit-tx.entity';
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import {
  Between,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';

@Injectable()
export class BackOfficeService {
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
        const walletAddress = user.wallet.walletAddress;
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
      console.error(error);
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

  async salesReport(startDate: Date, endDate: Date) {
    const betOrders = await this.betOrderRepository
      .createQueryBuilder('betOrder')
      .leftJoinAndSelect('betOrder.walletTx', 'walletTx')
      .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
      .leftJoinAndSelect('betOrder.claimDetail', 'claimDetail')
      .where('betOrder.createdDate BETWEEN :startDate AND :endDate', {
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
    const start = startDate;
    while (start < endDate) {
      resultByDate[start.toDateString()] = {
        totalBetAmount: 0,
        betCount: 0,
        userCount: 0,
        totalPayout: 0,
        totalPayoutRewards: 0,
        commissionAmount:
          commissions.find(
            (_commision) =>
              _commision.createdDate.toDateString() === start.toDateString(),
          )?.txAmount || 0,
      };
      start.setDate(start.getDate() + 1);
    }

    const userByDate = {};
    betOrders[0].map((betOrder) => {
      const date = betOrder.createdDate.toDateString();
      if (!userByDate[date]) {
        userByDate[date] = new Set();
      }

      resultByDate[date].totalBetAmount +=
        +betOrder.bigForecastAmount + +betOrder.smallForecastAmount;
      resultByDate[date].betCount += 1;
      resultByDate[date].userCount += userByDate[date].has(
        betOrder.walletTx.userWallet.userId,
      )
        ? 0
        : 1;
      userByDate[date].add(betOrder.walletTx.userWallet.userId);

      if (betOrder.claimDetail) {
        resultByDate[date].totalPayoutRewards +=
          (+betOrder.claimDetail.claimAmount || 0) +
          (+betOrder.claimDetail.bonusAmount || 0);

        resultByDate[date].totalPayout +=
          +betOrder.claimDetail.claimAmount || 0;
      }
    });

    return {
      data: resultByDate,
    };
  }
}
