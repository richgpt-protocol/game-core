import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserWallet } from './entities/user-wallet.entity';
import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(UserWallet)
    private walletRepository: Repository<UserWallet>,
  ) {}

  async getWalletInfo(id: number) {
    const walletInfo = await this.walletRepository
      .createQueryBuilder('wallet')
      .where({ user: id })
      .getOne();
    return walletInfo;
  }

  calculateLevel(point: number): number {
    // exponential growth xp calculation, refer
    // https://chat.openai.com/share/f6ad93ae-048d-43bf-bca8-7804a347e6e9
    const growthFactor = 1.584893192;
    return Math.floor(Math.log(point) / Math.log(growthFactor));
  }
}
