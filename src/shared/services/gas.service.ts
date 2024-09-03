import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ethers } from 'ethers';
import { AdminNotificationService } from './admin-notification.service';
import { ReloadTx } from 'src/wallet/entities/reload-tx.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { catchError, firstValueFrom } from 'rxjs';
import { MPC } from '../mpc';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Mutex } from 'async-mutex';

@Injectable()
export class GasService {
  private readonly cronMutex: Mutex = new Mutex();

  constructor(
    @InjectRepository(ReloadTx)
    private readonly reloadTxRepository: Repository<ReloadTx>,
    @InjectRepository(UserWallet)
    private readonly userWalletRepository: Repository<UserWallet>,
    private readonly adminNotificationService: AdminNotificationService,
    private readonly httpService: HttpService,
    private dataSource: DataSource,
  ) {}

  @OnEvent('gas.service.reload', { async: true })
  async handleGasReloadEvent(userAddress: string, chainId: number): Promise<void> {
    const provider_rpc_url = chainId === Number(process.env.OPBNB_CHAIN_ID)
      ? process.env.OPBNB_PROVIDER_RPC_URL
      : process.env.BNB_PROVIDER_RPC_URL;
    const provider = new ethers.JsonRpcProvider(provider_rpc_url);
    const balance = await provider.getBalance(userAddress);

    if (balance < ethers.parseEther('0.001')) {
      let amount = '';
      if (!this._isAdmin(userAddress)) {
        amount = '0.001'

        // find userWallet through userAddress
        const userWallet = await this.userWalletRepository.findOne({
          where: {
            walletAddress: userAddress,
          },
        });

        // create reload tx
        await this.reloadTxRepository.save(
          this.reloadTxRepository.create({
            amount: Number(amount),
            status: 'P',
            chainId,
            currency: 'BNB',
            amountInUSD: await this._getAmountInUSD(amount),
            txHash: null,
            retryCount: 0,
            userWallet,
            userWalletId: userWallet.id,
          })
        );

      } else {
        // no reloadTx for admin reload because
        // no userWallet for admin (userWalletId is compulsory)
        // just simply reload admin wallet
        const provider_rpc_url = chainId === Number(process.env.OPBNB_CHAIN_ID)
          ? process.env.OPBNB_PROVIDER_RPC_URL
          : process.env.BNB_PROVIDER_RPC_URL;
        const provider = new ethers.JsonRpcProvider(provider_rpc_url);
        
        const supplyAccount = new ethers.Wallet(
          await MPC.retrievePrivateKey(process.env.SUPPLY_ACCOUNT_ADDRESS),
          provider
        );

        await supplyAccount.sendTransaction({
          to: userAddress,
          // reload 0.01 BNB for admin wallet
          value: ethers.parseEther('0.01')
        });
      }
    }
  }

  @Cron(CronExpression.EVERY_SECOND)
  async handlePendingReloadTx(): Promise<void> {
    console.log('handlePendingReloadTx(): started');
    const release = await this.cronMutex.acquire();
    console.log('handlePendingReloadTx(): mutex acquired');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    console.log('handlePendingReloadTx(): queryRunner started');
    
    try {
      const reloadTx = await queryRunner.manager.findOne(ReloadTx, {
        where: { status: 'P' },
        relations: { userWallet: true },
        order: { id: 'ASC' },
      });
  
      while (reloadTx.retryCount < 5) {
        try {
          const provider_rpc_url = reloadTx.chainId === Number(process.env.OPBNB_CHAIN_ID)
            ? process.env.OPBNB_PROVIDER_RPC_URL
            : process.env.BNB_PROVIDER_RPC_URL;
          const provider = new ethers.JsonRpcProvider(provider_rpc_url);
          
          const supplyAccount = new ethers.Wallet(
            await MPC.retrievePrivateKey(process.env.SUPPLY_ACCOUNT_ADDRESS),
            provider
          );

          const txResponse = await supplyAccount.sendTransaction({
            to: reloadTx.userWallet.walletAddress,
            value: ethers.parseEther(reloadTx.amount.toString())
          });
          const txReceipt = await txResponse.wait();
          reloadTx.txHash = txReceipt.hash;
          
          if (txReceipt.status === 1) {
            reloadTx.status = 'S';
            break;

          } else {
            reloadTx.status = 'F';
            reloadTx.retryCount++;
          }

        } catch (error) {
          reloadTx.status = 'F';
          reloadTx.retryCount++;
        }
      }

      await queryRunner.manager.save(reloadTx);
      await queryRunner.commitTransaction();

      if (reloadTx.status === 'F') {
        // native token transfer failed, inform admin
        await this.adminNotificationService.setAdminNotification(
          `On-chain transaction failed in GasService.handlePendingReloadTx, txHash: ${reloadTx.txHash}`,
          'onChainTxError',
          'On-chain Transaction Failed in GasService.handlePendingReloadTx',
          true,
        );
      }

    } catch (error) {
      console.error('Critical error in handlePendingReloadTx()', error);

      await this.adminNotificationService.setAdminNotification(
        error,
        'CRITICAL_FAILURE',
        'Critical failure in handlePendingReloadTx()',
        true,
        true,
      );

    } finally {
      await queryRunner.release();
      console.log('handlePendingReloadTx(): queryRunner released');
      release();
      console.log('handlePendingReloadTx(): mutex released');
    }
    console.log('handlePendingReloadTx(): end');
  }

  private _isAdmin(userAddress: string): boolean {
    const adminAddress = [
      process.env.WALLET_CREATION_BOT_ADDRESS,
      process.env.DEPOSIT_BOT_ADDRESS,
      process.env.PAYOUT_BOT_ADDRESS,
      process.env.RESULT_BOT_ADDRESS,
      process.env.POINT_REWARD_BOT_ADDRESS,
      process.env.HELPER_BOT_ADDRESS,
    ]
    return adminAddress.includes(userAddress);
  }

  // fetch bnb price through defillama
  private async _getAmountInUSD(amount: string): Promise<number> {
    const wbnbAddress = 'bsc:0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
    const requestUrl = `https://coins.llama.fi/prices/current/${wbnbAddress}`;
    const { data } = await firstValueFrom(
      this.httpService.get(requestUrl).pipe(
        catchError((error) => {
          throw new Error(`Error in GasService._getAmountInUSD, error: ${error}`);
        })
      )
    );
    return Number(amount) * data.coins[wbnbAddress].price;
  }
}
