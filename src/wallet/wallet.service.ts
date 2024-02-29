/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable } from '@nestjs/common';
import { ChatCompletionMessageParam } from 'openai/resources';
// import { SendMessageDto } from './dto/bet.dto';
// import { MongoClient, WithId } from 'mongodb'
import * as dotenv from 'dotenv'
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import { Bet } from 'src/game/entities/bet.entity';
import { User } from 'src/user/entities/user.entity';
import { BetDto } from 'src/game/dto/bet.dto';
dotenv.config()

// const client = new MongoClient('mongodb://localhost:27017')

@Injectable()
export class WalletService {

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(Bet)
    private betRepository: Repository<Bet>,
  ) {}

  async getWalletInfo(id: number) {
    const walletInfo = await this.walletRepository
      .createQueryBuilder('wallet')
      .where({ user: id })
      .getOne();
    return walletInfo;
  }
}
