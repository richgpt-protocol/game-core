/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClaimDto } from './dto/claim.dto';
import { Claim } from './entities/claim.entity';
import { Repository } from 'typeorm';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { Bet } from 'src/bet/entities/bet.entity';
import { Game } from 'src/game/entities/game.entity';

@Injectable()
export class ClaimService {

  constructor(
    @InjectRepository(Claim)
    private claimRepository: Repository<Claim>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(Bet)
    private betRepository: Repository<Bet>,
    @InjectRepository(Game)
    private gameRepository: Repository<Game>,
  ) {}

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
}
