import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ChatLog } from 'src/chatbot/entities/chatLog.entity';
import { BetOrder } from 'src/game/entities/bet-order.entity';
import { DrawResult } from 'src/game/entities/draw-result.entity';
import { User } from 'src/user/entities/user.entity';
import { DataSource, Repository, IsNull, Like } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { PointTx } from './entities/point-tx.entity';
import { WalletService } from 'src/wallet/wallet.service';
import { UserService } from 'src/user/user.service';
import { Setting } from 'src/setting/entities/setting.entity';
import { SetReferralPrizeBonusDto } from './points.dto';

@Injectable()
export class PointService {
  constructor(
    @InjectRepository(ChatLog)
    private chatLogRepository: Repository<ChatLog>,
    @InjectRepository(BetOrder)
    private betOrderRepository: Repository<BetOrder>,
    @InjectRepository(DrawResult)
    private drawResultRepository: Repository<DrawResult>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(PointTx)
    private pointTxRepository: Repository<PointTx>,
    @InjectRepository(Setting)
    private settingRepository: Repository<Setting>,
    private dataSource: DataSource,
    private adminNotificationService: AdminNotificationService,
    private walletService: WalletService,
    private userService: UserService,
  ) {}

  getDepositPoints(depositAmount: number): { xp: number; bonusPerc: number } {
    const baseXPPerUsd = 1000;
    return { xp: depositAmount * baseXPPerUsd, bonusPerc: 0 }; //TODO
    // switch (depositAmount) {
    //   case 5:
    //     return { xp: 5, bonusPerc: 0 };
    //   case 10:
    //     return { xp: 10, bonusPerc: 10 };
    //   case 20:
    //     return { xp: 20, bonusPerc: 25 };
    //   case 50:
    //     return { xp: 50, bonusPerc: 50 };
    //   case 100:
    //     return { xp: 100, bonusPerc: 100 };
    //   default:
    //     return { xp: 0, bonusPerc: 0 };
    //   // throw new Error('Invalid deposit amount');
    // }
  }

  /// This method should not be called more than once per day
  async getDailyActiveUserPoints(userId: number, date: Date): Promise<number> {
    const dailyActiveUserPoints = 1;

    const chatLogs = await this.chatLogRepository.find({
      where: {
        userId,
        createAt: date,
      },
    });

    if (chatLogs.length >= 3) {
      return dailyActiveUserPoints;
    } else {
      return 0;
    }
  }

  async getBetPointsReferrer(
    reffererId: number,
    betAmount: number,
    currentBetWalletTxId: number,
  ): Promise<number> {
    const baseBetPointsPerUSD = 200;
    const pointPer10s = 2_000;
    const pointPer100s = 20_000;
    const pointPer1000s = 200_000;
    const pointPer10000s = 2_000_000;

    const threshold = [
      { amount: 10000, points: pointPer10000s },
      { amount: 1000, points: pointPer1000s },
      { amount: 100, points: pointPer100s },
      { amount: 10, points: pointPer10s },
    ];

    let betPoints = betAmount * baseBetPointsPerUSD;

    const currentDate = new Date();
    const pastBets = await this.betOrderRepository
      .createQueryBuilder('betOrder')
      .innerJoin('betOrder.walletTx', 'walletTx')
      .innerJoin('walletTx.userWallet', 'userWallet')
      .innerJoin('userWallet.user', 'user')
      .where('user.referralUserId = :reffererId', { reffererId })
      .andWhere('walletTx.status = :status', { status: 'S' })
      .andWhere('betOrder.createdDate >= :date', {
        date: new Date(
          currentDate.getUTCFullYear(),
          currentDate.getUTCMonth(),
          1,
        ),
      })
      .andWhere('walletTx.txType = :txType', {
        txType: 'PLAY',
      })
      .andWhere('betOrder.walletTxId != :currentBetWalletTxId', {
        currentBetWalletTxId,
      })
      .getMany();

    const currentBetOrders = await this.betOrderRepository.find({
      where: {
        walletTxId: currentBetWalletTxId,
      },
    });

    const currentBetAmount = currentBetOrders.reduce(
      (acc, bet) => acc + +bet.bigForecastAmount + +bet.smallForecastAmount,
      0,
    );

    const pastBetAmount = pastBets.reduce(
      (acc, bet) => acc + +bet.bigForecastAmount + +bet.smallForecastAmount,
      0,
    );

    const totalBetAmount = pastBetAmount + currentBetAmount;
    for (const { amount, points } of threshold) {
      if (
        pastBetAmount < amount &&
        currentBetAmount + pastBetAmount >= amount
      ) {
        //no of 10s, 100s, 1000s, 10000s
        const noOfAmounts = Math.floor(totalBetAmount / amount);
        betPoints += noOfAmounts * points;
        break;
      }
    }

    // if (totalBetAmount >= 10000) {
    //   const noOfTenThousands = Math.floor(totalBetAmount / 10000);

    //   // Add 10000 points for every 10000 USD bet.
    //   // For example, if the user bet 20000 USD, he will get 20000 points.
    //   // if the user bet 19999 USD, he will get 10000 points.
    //   betPoints += noOfTenThousands * pointPer10000s;
    // } else if (totalBetAmount >= 1000) {
    //   const noOfThousands = Math.floor(totalBetAmount / 1000);

    //   // Add 1000 points for every 1000 USD bet.
    //   // For example, if the user bet 2000 USD, he will get 2000 points.
    //   // if the user bet 1999 USD, he will get 1000 points.
    //   betPoints += noOfThousands * pointPer1000s;
    // } else if (totalBetAmount >= 100) {
    //   const noOfHundreds = Math.floor(totalBetAmount / 100);

    //   // Add 100 points for every 100 USD bet.
    //   // For example, if the user bet 200 USD, he will get 200 points.
    //   // if the user bet 199 USD, he will get 100 points.
    //   betPoints += noOfHundreds * pointPer100s;
    // } else if (totalBetAmount >= 10) {
    //   const noOfTens = Math.floor(totalBetAmount / 10);

    //   // Add 10 points for every 10 USD bet.
    //   // For example, if the user bet 50 USD, he will get 50 points.
    //   // if the user bet 11 USD, he will get 10 points.
    //   betPoints += noOfTens * pointPer10s;
    // }

    return betPoints;
  }

  async getBetPoints(
    userId: number,
    betAmount: number,
    currentBetWalletTxId: number,
  ): Promise<number> {
    const baseBetPointsPerUSD = 1000;
    const pointPer10s = 10_000;
    const pointPer100s = 100_000;
    const pointPer1000s = 1_000_000;
    const pointPer10000s = 10_000_000;

    const threshold = [
      { amount: 10000, points: pointPer10000s },
      { amount: 1000, points: pointPer1000s },
      { amount: 100, points: pointPer100s },
      { amount: 10, points: pointPer10s },
    ];

    let betPoints = betAmount * baseBetPointsPerUSD;

    const currentDate = new Date();
    const pastBets = await this.betOrderRepository
      .createQueryBuilder('betOrder')
      .innerJoin('betOrder.walletTx', 'walletTx')
      .innerJoin('walletTx.userWallet', 'userWallet')
      .where('userWallet.userId = :userId', { userId })
      .andWhere('walletTx.status = :status', { status: 'S' })
      .andWhere('betOrder.createdDate >= :date', {
        date: new Date(
          currentDate.getUTCFullYear(),
          currentDate.getUTCMonth(),
          1,
        ),
      })
      .andWhere('betOrder.walletTxId != :currentBetWalletTxId', {
        currentBetWalletTxId,
      })
      .getMany();

    const currentBets = await this.betOrderRepository.find({
      where: {
        walletTxId: currentBetWalletTxId,
      },
    });

    const currentBetAmount = currentBets.reduce(
      (acc, bet) => acc + +bet.bigForecastAmount + +bet.smallForecastAmount,
      0,
    );

    const pastBetAmount = pastBets.reduce(
      (acc, bet) => acc + +bet.bigForecastAmount + +bet.smallForecastAmount,
      0,
    );

    const totalBetAmount = pastBetAmount + currentBetAmount;

    for (const { amount, points } of threshold) {
      if (
        pastBetAmount < amount &&
        currentBetAmount + pastBetAmount >= amount
      ) {
        //no of 10s, 100s, 1000s, 10000s
        const noOfAmounts = Math.floor(totalBetAmount / amount);
        betPoints += noOfAmounts * points;
        break;
      }
    }

    return betPoints;
  }

  async getWinXp(epoch: number, numberPair: string): Promise<number> {
    const consolationXP = 1_000_000;
    const specialXP = 3_000_000;
    const thirdPrizeXP = 10_000_000;
    const secondPrizeXP = 20_000_000;
    const firstPrizeXP = 50_000_000;

    const drawResult = await this.drawResultRepository
      .createQueryBuilder('drawResult')
      .innerJoin('drawResult.game', 'game')
      .where('game.epoch = :epoch', { epoch })
      .andWhere('drawResult.numberPair = :numberPair', { numberPair })
      .getOne();

    if (!drawResult) {
      return 0;
    }

    switch (drawResult.prizeCategory) {
      case 'C':
        return consolationXP;
      case 'S':
        return specialXP;
      case '3':
        return thirdPrizeXP;
      case '2':
        return secondPrizeXP;
      case '1':
        return firstPrizeXP;
      default:
        return 0;
    }
  }

  getReferralDepositXp(depositAmount: number): number {
    // const percentage = 0.2; //20%
    // let amount = depositAmount * percentage;
    const baseXpPerUsdDeposit = 200;
    const amount = depositAmount * baseXpPerUsdDeposit;
    return amount;
  }

  // async getReferralBetXp(
  //   referrerId: number,
  //   betAmount: number,
  //   currentBetWalletTxId: number,
  // ): Promise<number> {
  //   const baseReferralBetXpPerUSD = 200;
  //   const totalXp = betAmount * baseReferralBetXpPerUSD;

  //   const refferedusers = await this.userRepository
  //     .createQueryBuilder('user')
  //     .select('user.id')
  //     .leftJoin('user.referralUser', 'referralUser')
  //     .where('referralUser.id = :referrerId', { referrerId })
  //     .getMany();

  //   const pastBetsOfReferredUsers = await this.betOrderRepository
  //     .createQueryBuilder('betOrder')
  //     .innerJoin('betOrder.walletTx', 'walletTx')
  //     .innerJoin('walletTx.userWallet', 'userWallet')
  //     .where('userWallet.userId IN (:...userIds)', {
  //       userIds: refferedusers.map((user) => user.id),
  //     })
  //     .andWhere('walletTx.status = :status', { status: 'S' })
  //     .andWhere('betOrder.createdDate >= :date', {
  //       date: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
  //     })
  //     .andWhere('betOrder.walletTxId != :currentBetWalletTxId', {
  //       currentBetWalletTxId,
  //     })
  //     .getMany();

  //   const currentBetOder = await this.betOrderRepository.find({
  //     where: {
  //       walletTxId: currentBetWalletTxId,
  //     },
  //   });
  //   const currentBetAmount = currentBetOder.reduce(
  //     (acc, bet) => acc + +bet.bigForecastAmount + +bet.smallForecastAmount,
  //     0,
  //   );

  //   const totalBetAmount = pastBetsOfReferredUsers.reduce(
  //     (acc, bet) => acc + +bet.bigForecastAmount + +bet.smallForecastAmount,
  //     0,
  //   );

  //   if (totalBetAmount >= 10000) {
  //     return totalXp + 20_000_000;
  //   } else if (totalBetAmount >= 1000) {
  //     return totalXp + 200_000;
  //   } else if (totalBetAmount >= 100) {
  //     return totalXp + 20_000;
  //   } else if (totalBetAmount >= 10) {
  //     return totalXp + 2000;
  //   }

  //   return totalXp;
  // }

  async setReferralPrizeBonus(data: SetReferralPrizeBonusDto): Promise<void> {
    await this.settingRepository.upsert(
      [
        {
          key: 'referralPrizeBonusTier1',
          value: data.referralPrizeBonusTier1.toString(),
        },
        {
          key: 'referralPrizeBonusTier2',
          value: data.referralPrizeBonusTier2.toString(),
        },
        {
          key: 'referralPrizeBonusTier3',
          value: data.referralPrizeBonusTier3.toString(),
        },
        {
          key: 'referralPrizeBonusTier4',
          value: data.referralPrizeBonusTier4.toString(),
        },
        {
          key: 'referralPrizeBonusTier5',
          value: data.referralPrizeBonusTier5.toString(),
        },
        {
          key: 'referralPrizeBonusTier6',
          value: data.referralPrizeBonusTier6.toString(),
        },
        {
          key: 'referralPrizeBonusTier7',
          value: data.referralPrizeBonusTier7.toString(),
        },
        {
          key: 'referralPrizeBonusTier8',
          value: data.referralPrizeBonusTier8.toString(),
        },
        {
          key: 'referralPrizeBonusTier9',
          value: data.referralPrizeBonusTier9.toString(),
        },
        {
          key: 'referralPrizeBonusTier10',
          value: data.referralPrizeBonusTier10.toString(),
        },
      ],
      { conflictPaths: ['key'] },
    );

    return;
  }

  async getAllReferralPrizeBonus() {
    const setting = await this.settingRepository.find({
      where: {
        key: Like('REFERRAL_PRIZE_BONUS_TIER_%'),
      },
    });

    return Object.assign({}, ...setting.map((s) => ({ [s.key]: +s.value })));
  }

  async getReferralPrizeBonusTier(level: number): Promise<number> {
    const tier = Math.ceil(level / 10); //each tier has 10 levels
    const setting = await this.settingRepository.findOne({
      where: {
        key: `REFERRAL_PRIZE_BONUS_TIER_${tier}`,
      },
    });

    return setting ? +setting.value : 0;
  }

  @Cron('* * * * *') // check every minute
  async checkLevelUp(): Promise<void> {
    // start queryRunner
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const pointTxs = await this.pointTxRepository.find({
        where: {
          isLevelUp: IsNull(),
        },
      });

      for (const pointTx of pointTxs) {
        let isLevelUp = false;
        const levelBefore = Math.floor(
          this.walletService.calculateLevel(Number(pointTx.startingBalance)),
        );
        const levelAfter = Math.floor(
          this.walletService.calculateLevel(Number(pointTx.endingBalance)),
        );
        if (levelAfter > levelBefore) {
          await this.userService.setUserNotification(pointTx.walletId, {
            type: 'point',
            title: 'Congratulations on Level Up',
            message: `You just level up from ${levelBefore} to level ${levelAfter}!`,
            walletTxId: pointTx.walletTxId,
          });

          isLevelUp = true;
        }

        pointTx.isLevelUp = isLevelUp;
        await this.pointTxRepository.save(pointTx);
      }
    } catch (err) {
      await queryRunner.rollbackTransaction();

      // inform admin for rollback transaction
      await this.adminNotificationService.setAdminNotification(
        `Transaction in point.service.checkLevelUp had been rollback, error: ${err}`,
        'rollbackTxError',
        'Transaction Rollbacked',
        true,
      );
    } finally {
      await queryRunner.release();
    }
  }
}
