/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DepositTx } from 'src/wallet/entities/deposit-tx.entity';
import { Repository } from 'typeorm';
import { CreateDeopsitRequestDto, SupplyDto } from './dto/deposit.dto';
import { HttpService } from '@nestjs/axios';
import { response } from 'express';
import { AxiosResponse } from 'axios';
import { ConfigService } from 'src/config/config.service';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';

@Injectable()
export class DepositService {
  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
    @InjectRepository(UserWallet)
    private walletRepository: Repository<UserWallet>,
    @InjectRepository(DepositTx)
    private depositRepository: Repository<DepositTx>,
  ) {}

  async createDepositRequest(
    user: any,
    body: { chainId: number; address: string },
  ) {
    const response = await this.httpService.axiosRef.post(
      this.configService.get('DEPOSIT_BOT_URL') + '/deposit',
      {
        chainId: body.chainId,
        userId: user.userId,
        address: body.address,
      },
      {
        headers: {
          secret: this.configService.get('DEPOSIT_BOT_SECRET'),
          'Content-Type': 'application/json',
        },
      },
    );

    if (response.status !== 200) {
      throw new Error('Deposit request failed');
    }
    return true;
  }

  async supply(body: SupplyDto) {
    const wallet = await this.walletRepository.findOne({
      where: {
        walletAddress: body.address,
      },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    await this.depositRepository.insert({
      wallet: wallet,
      chainId: body.chainId,
      amount: body.amount,
      tokenAddress: body.tokenAddress,
      txHash: body.txHash,
    });

    await this.walletRepository.increment(
      { id: wallet.id },
      'balance',
      body.amount,
    );
  }
}
