/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable } from '@nestjs/common';
import { ChatCompletionMessageParam } from 'openai/resources';
// import { SendMessageDto } from './dto/bet.dto';
// import { MongoClient, WithId } from 'mongodb'
import * as dotenv from 'dotenv'
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bet } from './entities/bet.entity';
import { User } from 'src/user/entities/user.entity';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { BetDto } from './dto/bet.dto';
import { ClaimDto } from './dto/claim.dto';
import { Claim } from './entities/claim.entity';
import { Game } from './entities/game.entity';
import { RedeemDto } from './dto/redeem.dto';
import { Redeem } from './entities/redeem.entity';
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

  async bet(id: number, payload: BetDto[]) {

    // TODO: submit bet to Core contract

    const wallet = await this.walletRepository
      .createQueryBuilder()
      .where({ user: id })
      .getOne();
    let bets = []
    for (const bet of payload) {
      const game = await this.gameRepository.findOneBy({ epoch: bet.epoch });
      bets.push(this.betRepository.create({
        number: bet.number,
        forecast: bet.forecast,
        amount: bet.amount,
        wallet,
        game
      }));
    }
    const res = await this.betRepository.save(bets);
    return res
  }

  async claim(id: number, payload: ClaimDto[]) {

    // TODO: submit claim to Core contract

    const wallet = await this.walletRepository
      .createQueryBuilder()
      // .where('userId = :id', { id })
      .where({ user: id })
      .getOne();
    const bets = await this.betRepository
      .createQueryBuilder()
      .innerJoinAndSelect('Bet.game', 'Game')
      .where({ wallet })
      .getMany();
    let claims = []
    let totalClaimAmount = 0;
    for (const claim of payload) {
      const bet = bets.find(bet =>
        bet.game.epoch === claim.epoch &&
        bet.number === claim.number &&
        bet.forecast === claim.forecast &&
        bet.amount === claim.amount
      );
      const forecast = bet.forecast;
      const drawResultIndex = claim.drawResultIndex;
      let claimAmount = null;
      let prize = null;
      if (drawResultIndex === 0) {
        if (forecast) claimAmount = bet.amount * 2500;
        else claimAmount = bet.amount * 3500;
        prize = 'first';
      } else if (drawResultIndex === 1) {
        if (forecast) claimAmount = bet.amount * 1000;
        else claimAmount = bet.amount * 2000;
        prize = 'second';
      } else if (drawResultIndex === 2) {
        if (forecast) claimAmount = bet.amount * 500;
        else claimAmount = bet.amount * 1000;
        prize = 'third';
      } else if (drawResultIndex >= 3 && drawResultIndex <= 12 && forecast) {
        claimAmount = bet.amount * 180;
        prize = 'special';
      } else if (drawResultIndex >= 13 && drawResultIndex <= 32 && forecast) {
        claimAmount = bet.amount * 60;
        prize = 'consolation';
      }
      totalClaimAmount += claimAmount;
      const game = await this.gameRepository.findOneBy({ epoch: claim.epoch });
      claims.push(this.claimRepository.create({
        number: claim.number,
        forecast,
        claimAmount,
        drawResultIndex,
        prize: claim.drawResultIndex === 0 ? 'first' 
          : claim.drawResultIndex === 1 ? 'second'
          : claim.drawResultIndex === 2 ? 'third'
          : claim.drawResultIndex >= 3 && claim.drawResultIndex <= 12 ? 'special'
          : 'consolation',
        bet,
        wallet,
        game
      }));
    }
    const res = await this.claimRepository.save(claims);

    await this.walletRepository.update(
      wallet.id,
      { redeemable: wallet.redeemable + totalClaimAmount}
    )

    return res
  }

  async redeem(id: number, payload: RedeemDto) {

    // TODO: submit redeem to Redeem contract

    const wallet = await this.walletRepository
      .createQueryBuilder()
      .where('userId = :id', { id })
      .getOne();

    const amount = payload.amount;
    await this.walletRepository.update(
      wallet.id,
      { redeemable: wallet.redeemable - amount}
    )

    const redeem = this.redeemRepository.create({
      amount,
      wallet
    })
    const res = await this.redeemRepository.save(redeem);
    return res
  }

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

  async getUserBets(id: number, epoch: number) {
    const wallet = await this.walletRepository.
      createQueryBuilder('row')
      .where({ user: id })
      .getOne();
    const bets = await this.betRepository
      .createQueryBuilder('row')
      .select('row')
      .where({ wallet })
      .getMany();
    return bets.map(bet => {
      delete bet.id
      delete bet.walletId
      delete bet.gameId
      return bet
    });
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
