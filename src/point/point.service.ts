import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ChatLog } from 'src/chatbot/entities/chatLog.entity';
import { BetOrder } from 'src/game/entities/bet-order.entity';
import { DrawResult } from 'src/game/entities/draw-result.entity';
import { User } from 'src/user/entities/user.entity';
import { DataSource, Repository, IsNull } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { PointTx } from './entities/point-tx.entity';
import { WalletService } from 'src/wallet/wallet.service';
import { UserService } from 'src/user/user.service';

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
    private dataSource: DataSource,
    private adminNotificationService: AdminNotificationService,
    private walletService: WalletService,
    private userService: UserService,
  ) {}

  getDepositPoints(depositAmount: number): { xp: number; bonusPerc: number } {
    switch (depositAmount) {
      case 5:
        return { xp: 5, bonusPerc: 0 };
      case 10:
        return { xp: 10, bonusPerc: 10 };
      case 20:
        return { xp: 20, bonusPerc: 25 };
      case 50:
        return { xp: 50, bonusPerc: 50 };
      case 100:
        return { xp: 100, bonusPerc: 100 };
      default:
        return { xp: 0, bonusPerc: 0 };
      // throw new Error('Invalid deposit amount');
    }
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
    userId: number,
    betAmount: number,
  ): Promise<number> {
    const baseBetPointsPerUSD = 1;
    const pointPer10s = 10;
    const pointPer100s = 100;
    const pointPer1000s = 1000;
    const pointPer10000s = 10000;

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
      .getMany();

    const totalBetAmount = pastBets.reduce(
      (acc, bet) => acc + +bet.bigForecastAmount + +bet.smallForecastAmount,
      0,
    );

    if (totalBetAmount >= 10000) {
      const noOfTenThousands = Math.floor(totalBetAmount / 10000);

      // Add 10000 points for every 10000 USD bet.
      // For example, if the user bet 20000 USD, he will get 20000 points.
      // if the user bet 19999 USD, he will get 10000 points.
      betPoints += noOfTenThousands * pointPer10000s;
    } else if (totalBetAmount >= 1000) {
      const noOfThousands = Math.floor(totalBetAmount / 1000);

      // Add 1000 points for every 1000 USD bet.
      // For example, if the user bet 2000 USD, he will get 2000 points.
      // if the user bet 1999 USD, he will get 1000 points.
      betPoints += noOfThousands * pointPer1000s;
    } else if (totalBetAmount >= 100) {
      const noOfHundreds = Math.floor(totalBetAmount / 100);

      // Add 100 points for every 100 USD bet.
      // For example, if the user bet 200 USD, he will get 200 points.
      // if the user bet 199 USD, he will get 100 points.
      betPoints += noOfHundreds * pointPer100s;
    } else if (totalBetAmount >= 10) {
      const noOfTens = Math.floor(totalBetAmount / 10);

      // Add 10 points for every 10 USD bet.
      // For example, if the user bet 50 USD, he will get 50 points.
      // if the user bet 11 USD, he will get 10 points.
      betPoints += noOfTens * pointPer10s;
    }

    return betPoints;
  }

  async getBetPoints(userId: number, betAmount: number): Promise<number> {
    const baseBetPointsPerUSD = 2;
    const pointPer10s = 10;
    const pointPer100s = 100;

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
      .getMany();

    const totalBetAmount = pastBets.reduce(
      (acc, bet) => acc + +bet.bigForecastAmount + +bet.smallForecastAmount,
      0,
    );

    if (totalBetAmount >= 100) {
      const noOfHundreds = Math.floor(totalBetAmount / 100);

      // Add 100 points for every 100 USD bet.
      // For example, if the user bet 200 USD, he will get 200 points.
      // if the user bet 199 USD, he will get 100 points.
      betPoints += noOfHundreds * pointPer100s;
    } else if (totalBetAmount >= 10) {
      const noOfTens = Math.floor(totalBetAmount / 10);

      // Add 10 points for every 10 USD bet.
      // For example, if the user bet 50 USD, he will get 50 points.
      // if the user bet 11 USD, he will get 10 points.
      betPoints += noOfTens * pointPer10s;
    }

    return betPoints;
  }

  async getWinXp(epoch: number, numberPair: string): Promise<number> {
    const consolationXP = 1000;
    const specialXP = 3000;
    const thirdPrizeXP = 10000;
    const secondPrizeXP = 20000;
    const firstPrizeXP = 50000;

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
    switch (depositAmount) {
      case 5:
        return 2.5;
      case 10:
        return 5;
      case 20:
        return 10;
      case 50:
        return 25;
      case 100:
        return 50;
      default:
        return 0;
      // throw new Error('Invalid deposit amount');
    }
  }

  async getReferralBetXp(
    referrerId: number,
    betAmount: number,
  ): Promise<number> {
    const baseReferralBetXpPerUSD = 1;
    const totalXp = betAmount * baseReferralBetXpPerUSD;

    const refferedusers = await this.userRepository
      .createQueryBuilder('user')
      .select('user.id')
      .leftJoin('user.referralUser', 'referralUser')
      .where('referralUser.id = :referrerId', { referrerId })
      .getMany();

    const pastBetsOfReferredUsers = await this.betOrderRepository
      .createQueryBuilder('betOrder')
      .innerJoin('betOrder.walletTx', 'walletTx')
      .innerJoin('walletTx.userWallet', 'userWallet')
      .where('userWallet.userId IN (:...userIds)', {
        userIds: refferedusers.map((user) => user.id),
      })
      .andWhere('walletTx.status = :status', { status: 'S' })
      .andWhere('betOrder.createdDate >= :date', {
        date: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
      })
      .getMany();

    const totalBetAmount = pastBetsOfReferredUsers.reduce(
      (acc, bet) => acc + +bet.bigForecastAmount + +bet.smallForecastAmount,
      0,
    );

    if (totalBetAmount >= 10000) {
      return totalXp + 10000;
    } else if (totalBetAmount >= 1000) {
      return totalXp + 1000;
    } else if (totalBetAmount >= 100) {
      return totalXp + 100;
    } else if (totalBetAmount >= 10) {
      return totalXp + 10;
    }

    return totalXp;
  }

  @Cron('* * * * * *', { utcOffset: 0 }) // every hour UTC time
  async checkLevelUp(): Promise<void> {
    // start queryRunner
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {

      const pointTxs = await this.pointTxRepository.find({
        where: {
          isLevelUp: IsNull(),
        }
      })

      for (const pointTx of pointTxs) {
        let isLevelUp = false;
        const levelBefore = Math.floor(this.walletService.calculateLevel(Number(pointTx.startingBalance)));
        const levelAfter = Math.floor(this.walletService.calculateLevel(Number(pointTx.endingBalance)));
        if (levelAfter > levelBefore) {
          await this.userService.setUserNotification(
            pointTx.walletId,
            {
              type: 'point',
              title: 'Congratulations on Level Up',
              message: `You have level up from ${levelBefore} to level ${levelAfter}.`,
              walletTxId: pointTx.walletTxId,
            }
          )

          isLevelUp = true;
        }

        pointTx.isLevelUp = isLevelUp;
        await this.pointTxRepository.save(pointTx)
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
