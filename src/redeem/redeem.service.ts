/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RedeemDto } from './dto/redeem.dto';
import { RedeemTx } from 'src/wallet/entities/redeem-tx.entity';
import { Repository } from 'typeorm';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';

@Injectable()
export class RedeemService {

  constructor(
    @InjectRepository(RedeemTx)
    private redeemRepository: Repository<RedeemTx>,
    @InjectRepository(UserWallet)
    private walletRepository: Repository<UserWallet>,
  ) {}

  async redeem(id: number, payload: RedeemDto) {

    // TODO: submit redeem to Redeem contract

    const wallet = await this.walletRepository
      .createQueryBuilder()
      .where('userId = :id', { id })
      .getOne();

    // const amount = payload.amount;
    // await this.walletRepository.update(
    //   wallet.id,
    //   { redeemable: wallet.redeemable - amount}
    // )

    // const redeem = this.redeemRepository.create({
    //   amount,
    //   wallet
    // })
    // const res = await this.redeemRepository.save(redeem);
    // return res
  }
}
