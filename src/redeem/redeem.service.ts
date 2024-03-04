/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RedeemDto } from './dto/redeem.dto';
import { Redeem } from './entities/redeem.entity';
import { Repository } from 'typeorm';
import { Wallet } from 'src/wallet/entities/wallet.entity';

@Injectable()
export class RedeemService {

  constructor(
    @InjectRepository(Redeem)
    private redeemRepository: Repository<Redeem>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
  ) {}

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
}
