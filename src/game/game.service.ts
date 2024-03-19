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
import { Game } from './entities/game.entity';
import { RedeemDto } from '../redeem/dto/redeem.dto';
import { DrawResultDto } from './dto/drawResult.dto';
import { DrawResult } from './entities/draw-result.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { RedeemTx } from 'src/wallet/entities/redeem-tx.entity';
import { BetOrder } from './entities/bet-order.entity';
import { ClaimDetail } from 'src/wallet/entities/claim-detail.entity';
dotenv.config();

// const client = new MongoClient('mongodb://localhost:27017')

@Injectable()
export class GameService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserWallet)
    private walletRepository: Repository<UserWallet>,
    @InjectRepository(Game)
    private gameRepository: Repository<Game>,
    @InjectRepository(BetOrder)
    private betRepository: Repository<BetOrder>,
    @InjectRepository(ClaimDetail)
    private claimRepository: Repository<ClaimDetail>,
    @InjectRepository(RedeemTx)
    private redeemRepository: Repository<RedeemTx>,
    @InjectRepository(DrawResult)
    private drawResultRepository: Repository<DrawResult>,
  ) {}

  async setDrawResult(id: number, payload: DrawResultDto) {
    // TODO: submit draw result to Core contract

    const game = await this.gameRepository.findOneBy({
      epoch: payload.epoch.toString(),
    });
    const drawResult = this.drawResultRepository.create({
      ...payload,
      game,
    });
    const res = await this.drawResultRepository.save(drawResult);

    await this.gameRepository.save(
      this.gameRepository.create({
        epoch: game.epoch + 1,
      }),
    );

    return res;
  }

  async getDrawResult(epoch: number) {
    const game = await this.gameRepository.findOneBy({
      epoch: epoch.toString(),
    });
    const drawResult = await this.drawResultRepository
      .createQueryBuilder('row')
      .where({ game })
      .getOne();
    return drawResult;
  }
}