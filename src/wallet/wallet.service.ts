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
    // const f = 50 * a^3 + 1000 * exp(0.1 * a)

    // exponential growth xp calculation, refer
    // https://chat.openai.com/share/f6ad93ae-048d-43bf-bca8-7804a347e6e9
    // const growthFactor = 1.584893192;
    // const level = Math.log(point) / Math.log(growthFactor);

    const level = this.levelMap.find((level) => level.xp <= point).level;
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
