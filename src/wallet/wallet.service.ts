import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserWallet } from './entities/user-wallet.entity';
import { WalletTx } from './entities/wallet-tx.entity';
import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class WalletService {
  levelMap = [];
  constructor(
    @InjectRepository(UserWallet)
    private userWalletRepository: Repository<UserWallet>,
    @InjectRepository(WalletTx)
    private walletTxRepository: Repository<WalletTx>,
  ) {
    for (let i = 1; i <= 100; i++) {
      const xp = Math.floor(50 * Math.pow(i, 3) + 1000 * Math.exp(0.1 * i));
      this.levelMap.push({ xp, level: i });
    }
  }

  async getWalletInfo(id: number) {
    const walletInfo = await this.userWalletRepository
      .createQueryBuilder('wallet')
      .where({ userId: id })
      .getOne();
    return walletInfo;
  }

  calculateLevel(point: number): number {
    // minimum level 1
    // input point 1 will result 0 in below calculation
    // input point > 1 will result in normal
    const level1 = this.levelMap.find((level) => level.level === 1);
    if (point < level1.xp) return 0;
  
    const levels = this.levelMap.filter((level) => level.xp <= point);
    const highestLevel = levels[levels.length - 1].level;
  
    return highestLevel;
  }

  calculateLevelAndPercentage(point: number): { level: number; percentage: number } {
    const level1 = this.levelMap.find((level) => level.level === 1);
    if (point < level1.xp) return { level: 0, percentage: 0 };

    const levels = this.levelMap.filter((level) => level.xp <= point);
    const highestLevel = levels[levels.length - 1].level;
    // highestLevel is the current level

    // Find the next and previous level
    const nextLevel = this.levelMap.find((level) => level.level === highestLevel + 1);
    const previousLevel = this.levelMap.find((level) => level.level === highestLevel);

    // Calculate the percentage towards the next level
    const xpForCurrentLevel = point - previousLevel.xp;
    const xpForNextLevel = nextLevel.xp - previousLevel.xp;
    const percentage = Math.floor((xpForCurrentLevel / xpForNextLevel) * 100);

    return { level: highestLevel, percentage };
  }

  async getWalletTx(userId: number, count: number) {
    const walletTxs = await this.walletTxRepository.find({
      where: {
        userWalletId: userId,
        status: 'S',
      },
      order: { createdDate: 'DESC' },
    });

    return walletTxs.map((walletTx) => {
      const { id, txHash, updatedDate, userWalletId, ...rest } = walletTx;
      return rest;
    });
  }

  async getTicket(userId: number) {
    const betWalletTxs = await this.walletTxRepository.find({
      where: {
        userWalletId: userId,
        txType: 'PLAY',
        status: 'S',
      },
      order: { id: 'DESC' },
      relations: ['betOrders', 'betOrders.game', 'betOrders.game.drawResult'],
    });

    return betWalletTxs;
  }

  async getPointHistory(userId: number, count: number) {
    const userWallet = await this.userWalletRepository.findOne({
      where: { userId },
      // todo: use sql query to filter pointTx
      relations: { pointTx: true },
    });
    count =
      count > userWallet.pointTx.length ? userWallet.pointTx.length : count;
    const pointTxs = userWallet.pointTx
      .sort((a, b) => b.createdDate.getTime() - a.createdDate.getTime())
      .slice(0, count);

    return pointTxs.map((pointTx) => {
      const { id, updatedDate, walletId, ...rest } = pointTx;
      return rest;
    });
  }
}
