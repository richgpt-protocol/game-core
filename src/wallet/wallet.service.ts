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
      const xp = 50 * Math.pow(i, 3) + 1000 * Math.exp(0.1 * i);
      const prev = this.levelMap.length > 0 ? this.levelMap[i - 2].xp : 0;
      this.levelMap.push({ xp: xp + prev, level: i + 1 });
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
    const level2 = this.levelMap.find((level) => level.level === 2);
    const maxLevel = this.levelMap[this.levelMap.length - 1];
    if (point < level2.xp) return 1;

    if (point >= maxLevel.xp) return maxLevel.level - 1;

    const level = this.levelMap.find((level) => level.xp > point).level - 1;
    return level;
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
