import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ethers } from 'ethers';
import { AdminNotificationService } from './admin-notification.service';
import { ReloadTx } from 'src/wallet/entities/reload-tx.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { catchError, firstValueFrom } from 'rxjs';

@Injectable()
export class GasService {

  constructor(
    @InjectRepository(ReloadTx)
    private readonly reloadTxRepository: Repository<ReloadTx>,
    @InjectRepository(UserWallet)
    private readonly userWalletRepository: Repository<UserWallet>,
    private readonly adminNotificationService: AdminNotificationService,
    private readonly httpService: HttpService,
  ) {}

  @OnEvent('gas.service.reload', { async: true })
  async handleGasReloadEvent(userAddress: string, chainId: number): Promise<void> {
    try {
      const provider_rpc_url = chainId === Number(process.env.OPBNB_CHAIN_ID)
        ? process.env.OPBNB_PROVIDER_RPC_URL
        : process.env.BNB_PROVIDER_RPC_URL;
      const provider = new ethers.JsonRpcProvider(provider_rpc_url);
      const balance = await provider.getBalance(userAddress);
      if (balance < ethers.parseEther('0.001')) {

        let amount = '';
        let reloadTx: ReloadTx = null;
        if (!this._isAdmin(userAddress)) {
          amount = '0.001'

          // find userWallet through userAddress
          const userWallet = await this.userWalletRepository.findOneBy({ walletAddress: userAddress });

          // create reload tx
          reloadTx = await this.reloadTxRepository.save(
            this.reloadTxRepository.create({
              amount: Number(amount),
              status: 'P',
              chainId,
              currency: 'BNB',
              amountInUSD: 0,
              txHash: null,
              retryCount: 0,
              userWalletId: userWallet.id,
            })
          );

        } else {
          // reload 0.01 BNB for admin wallet
          amount = '0.01'
          // no reloadTx for admin reload because
          // no userWallet for admin (userWalletId is compulsory)
        }

        // reload native token through wallet creation bot
        const supplyAccount = new ethers.Wallet(process.env.SUPPLY_ACCOUNT_PK, provider); // temporarily
        const txResponse = await supplyAccount.sendTransaction({
          to: userAddress,
          value: ethers.parseEther(amount)
        });

        const txReceipt = await txResponse.wait();
        if (reloadTx) {
          reloadTx.txHash = txReceipt.hash;
          await this.reloadTxRepository.save(reloadTx);
        }

        if (txReceipt.status === 0) {
          if (reloadTx) {
            reloadTx.status = 'F';
            await this.reloadTxRepository.save(reloadTx);
          }

          // native token transfer failed, inform admin
          await this.adminNotificationService.setAdminNotification(
            `On-chain transaction failed in GasService.handleGasReloadEvent, txHash: ${txReceipt.hash}`,
            'onChainTxError',
            'On-chain Transaction Failed in GasService.handleGasReloadEvent',
            true,
          );

        } else {
          // update reloadTx for non-admin wallet
          if (reloadTx) {
            reloadTx.status = 'S';
            reloadTx.amountInUSD = await this._getAmountInUSD(amount);
            await this.reloadTxRepository.save(reloadTx);
          }
        }
      }

    } catch (error) {
      console.error('Error in GasService.handleGasReloadEvent', error);
      // inform admin
      await this.adminNotificationService.setAdminNotification(
        `Error occur in GasService.handleGasReloadEvent, error: ${error}`,
        'error',
        'Error in GasService.handleGasReloadEvent',
        true,
      );
    }
  }

  private _isAdmin(userAddress: string): boolean {
    const adminAddress = [
      // wallet creation bot is the one which supply native token
      // so need to monitor & reload wallet creation bot manually if needed
      // process.env.WALLET_CREATION_BOT_ADDRESS,
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
