import { Injectable, Logger } from '@nestjs/common';
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
import { ConfigService } from 'src/config/config.service';
import { TxStatus } from '../enum/status.enum';
import { MultiCall__factory } from 'src/contract';

@Injectable()
export class GasService {
  private readonly logger = new Logger(GasService.name);
  private readonly cronMutex: Mutex = new Mutex();

  constructor(
    @InjectRepository(ReloadTx)
    private readonly reloadTxRepository: Repository<ReloadTx>,
    @InjectRepository(UserWallet)
    private readonly userWalletRepository: Repository<UserWallet>,
    private readonly adminNotificationService: AdminNotificationService,
    private readonly httpService: HttpService,
    private dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  @OnEvent('gas.service.reload', { async: true })
  async handleGasReloadEvent(userAddress: string, chainId: number): Promise<void> {
    const provider_rpc_url = this.configService.get(
      `PROVIDER_RPC_URL_${chainId.toString()}`,
    );
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
            status: TxStatus.PENDING,
            chainId,
            currency: 'BNB',
            amountInUSD: await this.getAmountInUSD(amount),
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
        const provider_rpc_url = this.configService.get(
          `PROVIDER_RPC_URL_${chainId.toString()}`,
        );
        const provider = new ethers.JsonRpcProvider(provider_rpc_url);
        
        // no error handling for admin wallet reload
        // try again in next reload
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

  async handlePendingReloadTx(chainId: number): Promise<void> {
    const multiCallContractAddress = this.configService.get(`MULTICALL_CONTRACT_ADDRESS_${chainId.toString()}`)
    if (!multiCallContractAddress) return;

    const release = await this.cronMutex.acquire();

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    
    try {
      const reloadTxs = await queryRunner.manager.find(ReloadTx, {
        where: {
          status: TxStatus.PENDING,
          chainId: chainId,
        },
        relations: { userWallet: true },
        order: { id: 'ASC' },
      });
      if (reloadTxs.length === 0) return;

      const provider_rpc_url = this.configService.get(
        `PROVIDER_RPC_URL_${chainId.toString()}`,
      );
      const provider = new ethers.JsonRpcProvider(provider_rpc_url);
      const supplyAccount = new ethers.Wallet(
        await MPC.retrievePrivateKey(this.configService.get('SUPPLY_ACCOUNT_ADDRESS')),
        provider
      );
      const multiCallContract = MultiCall__factory.connect(
        multiCallContractAddress,
        supplyAccount
      );
      const target: Array<string> = [];
      const data: Array<string> = [];
      const values: Array<bigint> = [];
      for (const reloadTx of reloadTxs) {
        target.push(reloadTx.userWallet.walletAddress);
        data.push('0x');
        values.push(ethers.parseEther('0.001'));
      }
      // sum up values
      const txResponse = await multiCallContract.multicall(
        target,
        data,
        values,
        {
          value: values.reduce((acc, cur) => acc + cur, 0n)
        }
      );
      const txReceipt = await txResponse.wait();

      for (const reloadTx of reloadTxs) {
        reloadTx.txHash = txReceipt.hash;
        if (txReceipt.status === 1) {
          reloadTx.status = TxStatus.SUCCESS;
        } else {
          reloadTx.retryCount++;

          if (reloadTx.retryCount >= 5) {
            reloadTx.status = TxStatus.FAILED;
            // native token transfer failed, inform admin
            await this.adminNotificationService.setAdminNotification(
              `On-chain transaction failed in GasService.handlePendingReloadTx${chainId.toString()}, txHash: ${reloadTx.txHash}`,
              'onChainTxError',
              `On-chain Transaction Failed in GasService.handlePendingReloadTx${chainId.toString()}`,
              true,
              true,
            );
          }
        }

        await queryRunner.manager.save(reloadTx);
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      this.logger.error(`handlePendingReloadTx${chainId.toString()}() error within queryRunner, error: ${error}`);
      // no queryRunner.rollbackTransaction() because it contain on-chain transaction
      // no new record created so it's safe not to rollback

      // inform admin
      await this.adminNotificationService.setAdminNotification(
        `Error occur in gas.service.handlePendingReloadTx, error: ${error}`,
        'CRITICAL_FAILURE',
        `Critical failure in handlePendingReloadTx${chainId.toString()}()`,
        true,
        true,
      );

    } finally {
      await queryRunner.release();
      release(); // release cronMutex
    }
  }

  @Cron(CronExpression.EVERY_SECOND)
  async handlePendingReloadTx56(): Promise<void> {
    await this.handlePendingReloadTx(56);
  }

  @Cron(CronExpression.EVERY_SECOND)
  async handlePendingReloadTx97(): Promise<void> {
    await this.handlePendingReloadTx(97);
  }

  @Cron(CronExpression.EVERY_SECOND)
  async handlePendingReloadTx204(): Promise<void> {
    await this.handlePendingReloadTx(204);
  }

  @Cron(CronExpression.EVERY_SECOND)
  async handlePendingReloadTx5611(): Promise<void> {
    await this.handlePendingReloadTx(5611);
  }

  private _isAdmin(userAddress: string): boolean {
    const adminAddress = [
      process.env.DEPOSIT_BOT_ADDRESS,
      process.env.PAYOUT_BOT_ADDRESS,
      process.env.RESULT_BOT_ADDRESS,
      process.env.HELPER_BOT_ADDRESS,
      process.env.CREDIT_BOT_ADDRESS,
      process.env.WITHDRAW_BOT_ADDRESS,
      process.env.DISTRIBUTE_REFERRAL_FEE_BOT_ADDRESS,
    ]
    return adminAddress.includes(userAddress);
  }

  // fetch bnb price through defillama
  async getAmountInUSD(amount: string): Promise<number> {
    const wbnbAddress = 'bsc:0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
    const requestUrl = `https://coins.llama.fi/prices/current/${wbnbAddress}`;
    const { data } = await firstValueFrom(
      this.httpService.get(requestUrl).pipe(
        catchError((error) => {
          throw new Error(`Error in GasService.getAmountInUSD, error: ${error}`);
        })
      )
    );
    return Number(amount) * data.coins[wbnbAddress].price;
  }

  async reloadNative(walletAddress: string, chainId: number): Promise<ethers.TransactionReceipt> {
    const provider_rpc_url = this.configService.get(
      `PROVIDER_RPC_URL_${chainId.toString()}`,
    );
    const provider = new ethers.JsonRpcProvider(provider_rpc_url);
    const supplyAccount = new ethers.Wallet(
      await MPC.retrievePrivateKey(this.configService.get('SUPPLY_ACCOUNT_ADDRESS')),
      provider
    );
    const txResponse = await supplyAccount.sendTransaction({
      to: walletAddress,
      value: ethers.parseEther('0.001')
    });
    const txReceipt = await txResponse.wait();
    return txReceipt;
  }
}
