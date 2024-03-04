/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Deposit } from './entities/deposit.entity';
import { Repository } from 'typeorm';
import { CreateDeopsitRequestDto, SupplyDto } from './dto/deposit.dto';
import { HttpService } from '@nestjs/axios';
import { response } from 'express';
import { AxiosResponse } from 'axios';
import { ConfigService } from 'src/config/config.service';
import { Wallet } from 'src/wallet/entities/wallet.entity';

@Injectable()
export class DepositService {
  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(Deposit)
    private depositRepository: Repository<Deposit>,
  ) {}

  async createDepositRequest(
    user: any,
    body: { chainId: number; address: string },
  ) {
    const response = await this.httpService.axiosRef.post(
      this.configService.get('DEPOSIT_BOT_URL') + '/deposit',
      {
        chainId: body.chainId,
        userId: user.id,
        address: body.address,
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
