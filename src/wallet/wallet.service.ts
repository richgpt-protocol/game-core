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
}
