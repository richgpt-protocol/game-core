/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable } from '@nestjs/common';
import { ChatCompletionMessageParam } from 'openai/resources';
// import { SendMessageDto } from './dto/bet.dto';
// import { MongoClient, WithId } from 'mongodb'
import * as dotenv from 'dotenv';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { BetDto } from 'src/bet/dto/bet.dto';
import { UserWallet } from './entities/user-wallet.entity';
import { BetOrder } from 'src/game/entities/bet-order.entity';
dotenv.config();

// const client = new MongoClient('mongodb://localhost:27017')

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserWallet)
    private walletRepository: Repository<UserWallet>,
    @InjectRepository(BetOrder)
    private betRepository: Repository<BetOrder>,
  ) {}

  async getWalletInfo(id: number) {
    const walletInfo = await this.walletRepository
      .createQueryBuilder('wallet')
      .where({ user: id })
      .getOne();
    return walletInfo;
  }
}
