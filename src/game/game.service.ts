/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable } from '@nestjs/common';
import { ChatCompletionMessageParam } from 'openai/resources';
// import { SendMessageDto } from './dto/bet.dto';
// import { MongoClient, WithId } from 'mongodb'
import * as dotenv from 'dotenv'
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bet } from 'src/bet/entities/bet.entity';
import { User } from 'src/user/entities/user.entity';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { BetDto } from 'src/bet/dto/bet.dto';
import { ClaimDto } from '../claim/dto/claim.dto';
import { Claim } from '../claim/entities/claim.entity';
import { Game } from './entities/game.entity';
import { RedeemDto } from '../redeem/dto/redeem.dto';
import { Redeem } from '../redeem/entities/redeem.entity';
import { DrawResultDto } from './dto/drawResult.dto';
import { DrawResult } from './entities/drawResult.entity';
dotenv.config()

// const client = new MongoClient('mongodb://localhost:27017')

@Injectable()
export class GameService {

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(Game)
    private gameRepository: Repository<Game>,
    @InjectRepository(Bet)
    private betRepository: Repository<Bet>,
    @InjectRepository(Claim)
    private claimRepository: Repository<Claim>,
    @InjectRepository(Redeem)
    private redeemRepository: Repository<Redeem>,
    @InjectRepository(DrawResult)
    private drawResultRepository: Repository<DrawResult>,
  ) {}

  async setDrawResult(id: number, payload: DrawResultDto) {

    // TODO: submit draw result to Core contract

    const game = await this.gameRepository.findOneBy({ epoch: payload.epoch });
    const drawResult = this.drawResultRepository.create({
      ...payload,
      game
    });
    const res = await this.drawResultRepository.save(drawResult);

    await this.gameRepository.save(
      this.gameRepository.create({
        epoch: game.epoch + 1,
      })
    );

    return res
  }

  async getDrawResult(epoch: number) {
    const game = await this.gameRepository.findOneBy({ epoch });
    const drawResult = await this.drawResultRepository
      .createQueryBuilder('row')
      .where({ game })
      .getOne();
    return drawResult
  }
}
