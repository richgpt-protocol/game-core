import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ChatLog } from 'src/chatbot/entities/chatLog.entity';
import { BetOrder } from 'src/game/entities/bet-order.entity';
import { DrawResult } from 'src/game/entities/draw-result.entity';
import { User } from 'src/user/entities/user.entity';
import { In, Repository } from 'typeorm';

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
  ) {}

  getDepositPoints(depositAmount: number): { xp: number; bonusPerc: number } {
    switch (depositAmount) {
      case 5:
        return { xp: 2.5, bonusPerc: 0 };
      case 10:
        return { xp: 11, bonusPerc: 10 };
      case 20:
        return { xp: 25, bonusPerc: 25 };
      case 50:
        return { xp: 75, bonusPerc: 50 };
      case 100:
        return { xp: 200, bonusPerc: 100 };
      default:
        throw new Error('Invalid deposit amount');
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

  async getBetPoints(userId: number, betAmount: number): Promise<number> {
    const baseBetPointsPerUSD = 1;
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
          currentDate.getFullYear(),
          currentDate.getMonth() + 1,
          1,
        ),
      })
      .getMany();

    const totalBetAmount = pastBets.reduce(
      (acc, bet) => acc + +bet.bigForecastAmount + +bet.smallForecastAmount,
      0,
    );

    if (totalBetAmount >= 100) {
      betPoints += 100;
    } else if (totalBetAmount >= 10) {
      betPoints += 10;
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
        throw new Error('Invalid deposit amount');
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
        date: new Date(new Date().getFullYear(), new Date().getMonth() , 1),
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
}
