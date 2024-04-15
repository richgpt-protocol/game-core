import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserWallet } from './entities/user-wallet.entity';
import { WalletTx } from './entities/wallet-tx.entity';
import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(UserWallet)
    private userWalletRepository: Repository<UserWallet>,
    @InjectRepository(WalletTx)
    private walletTxRepository: Repository<WalletTx>,
  ) {}

  async getWalletInfo(id: number) {
    const walletInfo = await this.userWalletRepository
      .createQueryBuilder('wallet')
      .where({ userId: id })
      .getOne();
    return walletInfo;
  }

  calculateLevel(point: number): number {
    // exponential growth xp calculation, refer
    // https://chat.openai.com/share/f6ad93ae-048d-43bf-bca8-7804a347e6e9
    const growthFactor = 1.584893192;
    return Math.log(point) / Math.log(growthFactor);
  }

  async getWalletTx(userId: number, count: number) {
    const walletTxs = await this.walletTxRepository.find({
      where: { userWalletId: userId },
      order: { createdDate: 'DESC' },
    })

    return walletTxs.map(walletTx => {
      const { id, txHash, updatedDate, userWalletId, ...rest } = walletTx;
      return rest;
    })
  }

  async getTicket(userId: number) {
    const betWalletTxs = await this.walletTxRepository.find({
      where: {
        userWalletId: userId,
        txType: 'PLAY',
        status: 'S',
      },
      order: { id: 'DESC' },
      relations: { betOrders: true },
    })

    return betWalletTxs;
  }

  async getPointHistory(userId: number, count: number) {
    const userWallet = await this.userWalletRepository.findOne({
      where: { userId },
      // todo: use sql query to filter pointTx
      relations: { pointTx: true },
    });
    count = count > userWallet.pointTx.length ? userWallet.pointTx.length : count;
    const pointTxs = userWallet.pointTx
      .sort((a, b) => b.createdDate.getTime() - a.createdDate.getTime())
      .slice(0, count);

    return pointTxs.map(pointTx => {
      const { id, updatedDate, walletId, ...rest } = pointTx;
      return rest;
    })
  }
}
