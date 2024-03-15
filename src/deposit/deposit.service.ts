/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  LessThan,
  MoreThan,
  MoreThanOrEqual,
  Not,
  Repository,
} from 'typeorm';
// import { CreateDeopsitRequestDto, SupplyDto } from './dto/deposit.dto';
import { HttpService } from '@nestjs/axios';
import { response } from 'express';
import axios, { AxiosResponse } from 'axios';
import { ConfigService } from 'src/config/config.service';
import { DepositTx } from 'src/wallet/entities/deposit-tx.entity';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { ReloadTx } from 'src/wallet/entities/reload-tx.entity';
import { DepositDTO } from './dto/deposit.dto';
import { Provider, ethers } from 'ethers';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';

@Injectable()
export class DepositService {
  constructor(
    @InjectRepository(DepositTx)
    private depositRepository: Repository<DepositTx>,
    @InjectRepository(WalletTx)
    private walletTxRepository: Repository<WalletTx>,
    @InjectRepository(UserWallet)
    private userWalletRepository: Repository<UserWallet>,
    @InjectRepository(ReloadTx)
    private reloadTx: Repository<ReloadTx>,
    @InjectRepository(GameUsdTx)
    private gameUsdTxRepository: Repository<GameUsdTx>,
    private httpService: HttpService,
    private configService: ConfigService,
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
  ) {}

  async processDeposit(payload: DepositDTO) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const userWallet = await queryRunner.manager.findOne(UserWallet, {
        where: {
          walletAddress: payload.walletAddress,
        },
      });

      const walletTx = new WalletTx();
      walletTx.txType = 'DEPOSIT';
      walletTx.txAmount = payload.amount;
      walletTx.txHash = payload.txHash;
      walletTx.status = 'P';
      walletTx.userWallet = userWallet;
      walletTx.userWalletId = userWallet.id;

      const depositTx = new DepositTx();
      depositTx.currency = payload.tokenAddress;
      depositTx.senderAddress = payload.depositerAddress;
      depositTx.receiverAddress = payload.walletAddress;
      depositTx.chainId = payload.chainId;
      depositTx.isTransferred = false;
      depositTx.txHash = null;
      depositTx.walletTx = walletTx;
      depositTx.walletTxId = walletTx.id;
      depositTx.status = 'P';

      const nativeBalance = await this.getNativeBalance(
        payload.walletAddress,
        payload.chainId,
      );
      const minimumNativeBalance = this.configService.get(
        `MINIMUM_NATIVE_BALANCE_${payload.chainId}`,
      );
      // if (nativeBalance < ethers.parseEther(minimumNativeBalance)) {
      const reloadTx = await this.reloadWallet(payload, +minimumNativeBalance);
      reloadTx.userWallet = userWallet;
      reloadTx.userWalletId = userWallet.id;

      await queryRunner.manager.save(reloadTx);
      // } else {
      //   //initiate token transfer to escrow and set depositTx.txHash
      //   //transfer gameUSD once above tx is successful
      //   //update status of depositTx and walletTx
      // }

      await queryRunner.manager.save(walletTx);
      await queryRunner.manager.save(depositTx);
      queryRunner.commitTransaction();
    } catch (error) {
      console.log(error);
      await queryRunner.rollbackTransaction();
    } finally {
      await queryRunner.release();
    }
  }

  private async reloadWallet(
    payload: DepositDTO,
    reloadAmount: number,
  ): Promise<ReloadTx> {
    const reloadTx = new ReloadTx();
    reloadTx.chainId = payload.chainId;
    reloadTx.status = 'P';
    reloadTx.amount = reloadAmount;
    reloadTx.txHash = null;
    reloadTx.amountInUSD = await this.getPriceInUSD(payload.tokenAddress);

    // try {
    //   const tx = await this.transferNative(
    //     payload.walletAddress,
    //     reloadAmount,
    //     payload.chainId,
    //   );

    //   this.eventEmitter.emit('reload', {
    //     reloadTx,
    //     tx,
    //   });
    // } catch (error) {
    //   console.log(`Error Native transfer tx ${reloadTx.id}`, error);
    // }

    return reloadTx;
  }

  private async getPriceInUSD(currency: string): Promise<number> {
    //TODO
    // const priceUrl = this.configService.get('PRICE_API_URL');
    // const response = await axios.get(priceUrl);
    // const price = +response.data[currency].usd;
    // return price;

    return 0;
  }

  private async getNativeBalance(walletAddress: string, chainId: number) {
    const provider = this.getProvider(chainId);
    const nativeBalance = await provider.getBalance(walletAddress);
    return nativeBalance;
  }

  private getProvider(chainId: number): Provider {
    const providerUrl = this.configService.get(`PROVIDER_URL_${chainId}`);
    return new ethers.JsonRpcProvider(providerUrl);
  }

  private async transferNative(
    target: string,
    amount: number,
    chainId: number,
  ) {
    try {
      const supplyWallet = new ethers.Wallet(
        this.configService.get('SUPPLY_PK'),
      );
      supplyWallet.connect(this.getProvider(chainId));
      const tx = await supplyWallet.sendTransaction({
        to: target,
        value: ethers.parseEther(amount.toString()),
      });
      return tx;
    } catch (error) {
      throw error;
    }
  }

  private async transferTokenToEscrow(
    tokenAddress: string,
    walletAddress: string,
    amount: number,
    chainId: number,
  ) {
    const userWallet = await this.userWalletRepository.findOne({
      where: {
        walletAddress,
      },
    });

    const provider = this.getProvider(chainId);
    const wallet = new ethers.Wallet(userWallet.privateKey, provider);
    const tokenContract = new ethers.Contract(
      tokenAddress,
      [`function transfer(address,uint256) external`],
      wallet,
    );
    const escrowAddress = this.configService.get('ESCROW_ADDRESS');
    const tx = await tokenContract.transfer(escrowAddress, amount);

    return tx;
  }

  // @OnEvent('reload', { async: true })
  // async handleReloadEvent({
  //   reloadTx,
  //   tx,
  // }: {
  //   reloadTx: ReloadTx;
  //   tx: ethers.TransactionResponse;
  // }) {
  //   try {
  //     const receipt = await tx.wait(1);
  //     if (receipt.status == 1) {
  //       reloadTx.txHash = tx.hash;
  //       reloadTx.status = 'S';
  //     }

  //     await this.reloadTx.save(reloadTx);
  //   } catch (error) {}
  // }

  @Cron('*/10 * * * * *')
  async handleGameUsdTx() {
    const pendingGameUsdTx = await this.gameUsdTxRepository.find({
      where: {
        status: 'P',
      },
    });

    for (const tx of pendingGameUsdTx) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        if (tx.retryCount >= 5) {
          tx.status = 'F';
          await queryRunner.manager.save(tx);

          //TODO admin notification
          continue;
        }

        const provider = this.getProvider(tx.chainId);
        const gameUsdWallet = new ethers.Wallet(
          this.configService.get('GAMEUSD_BOT_PK'),
          provider,
        );

        const gameUsdContract = new ethers.Contract(
          this.configService.get('GAMEUSDPOOL_ADDRESS'),
          [`function supply(address,uint256) external`],
          gameUsdWallet,
        );

        const onchainGameUsdTx = await gameUsdContract.supply(
          tx.receiverAddress,
          tx.amount,
        );

        const receipt = await onchainGameUsdTx.wait();
        if (receipt.status == 1) {
          tx.status = 'S';
          tx.txHash = onchainGameUsdTx.hash;
          await queryRunner.manager.save(tx);

          const walletTx = await queryRunner.manager.findOne(WalletTx, {
            where: {
              id: tx.walletTxId,
            },
          });

          walletTx.status = 'S';

          const previousWalletTx = await queryRunner.manager.findOne(WalletTx, {
            where: {
              userWalletId: walletTx.userWalletId,
            },
            order: {
              createdDate: 'DESC',
            },
          });

          walletTx.startingBalance = previousWalletTx.endingBalance;
          walletTx.endingBalance = previousWalletTx.endingBalance + tx.amount;

          walletTx.userWallet.walletBalance = walletTx.endingBalance;

          await queryRunner.manager.save(walletTx.userWallet);
          await queryRunner.manager.save(walletTx);

          await queryRunner.commitTransaction();
        }
      } catch (error) {
        await queryRunner.rollbackTransaction();
      } finally {
        await queryRunner.release();
      }
    }
  }

  @Cron('*/20 * * * * *')
  async handleEscrowTx() {
    const pendingDepositTxns = await this.depositRepository.find({
      where: {
        status: 'P',
      },
    });

    for (const tx of pendingDepositTxns) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        if (tx.retryCount >= 5) {
          tx.status = 'F';
          await queryRunner.manager.save(tx);

          //TODO admin notification
          continue;
        }

        const userWallet = await queryRunner.manager.findOne(UserWallet, {
          where: {
            id: tx.walletTx.userWalletId,
          },
        });

        const provider = this.getProvider(tx.chainId);
        const userSigner = new ethers.Wallet(userWallet.privateKey, provider);
        const tokenContract = new ethers.Contract(
          tx.currency,
          [`function transfer(address,uint256) external`],
          userSigner,
        );

        const escrowAddress = this.configService.get('ESCROW_ADDRESS');
        const onchainEscrowTx = await tokenContract.transfer(
          escrowAddress,
          tx.walletTx.txAmount,
        );

        const receipt = await onchainEscrowTx.wait(1);
        if (receipt.status == 1) {
          tx.status = 'S';
          tx.txHash = onchainEscrowTx.hash;
          tx.isTransferred = true;

          const gameUsdTx = new GameUsdTx();
          gameUsdTx.amount = tx.walletTx.txAmount;
          gameUsdTx.status = 'P';
          gameUsdTx.txHash = null;
          gameUsdTx.chainId = +this.configService.get('GAMEUSD_CHAIN_ID');
          gameUsdTx.senderAddress = this.configService.get(
            'GAMEUSD_BOT_ADDRESS',
          );
          gameUsdTx.receiverAddress = userWallet.walletAddress;
          gameUsdTx.walletTx = tx.walletTx;
          gameUsdTx.walletTxId = tx.walletTx.id;
          await queryRunner.manager.save(tx);
        } else {
          tx.retryCount += 1;
          await queryRunner.manager.save(tx);
        }

        await queryRunner.commitTransaction();
      } catch (err) {
        await queryRunner.rollbackTransaction();
      } finally {
        await queryRunner.release();
      }
    }
  }

  @Cron('*/10 * * * * *')
  async handleReloadTx() {
    const pendingReloadTx = await this.reloadTx.find({
      where: {
        status: 'P',
      },
    });

    for (const tx of pendingReloadTx) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        if (tx.retryCount >= 5) {
          tx.status = 'F';
          await this.reloadTx.save(tx);

          //TODO admin notification
          continue;
        }

        //send transaction
        const onchainTx = await this.transferNative(
          tx.userWallet.walletAddress,
          tx.amount,
          tx.chainId,
        );
        const receipt = await onchainTx.wait(1);

        if (receipt.status == 1) {
          tx.status = 'S';
          tx.txHash = onchainTx.hash;
          await this.reloadTx.save(tx);
        } else {
          tx.retryCount += 1;
          await this.reloadTx.save(tx);
        }
      } catch (error) {
        await queryRunner.rollbackTransaction();
      } finally {
        await queryRunner.release();
      }
    }
  }
}

/**
 * ISSUES
1. reload and escrow transactions could run at the same time.
   - update escrow transaction hash but not the status - can't
2. point 3:C is not possible. Couldn't find reload txn's status from depositTx entity
    - can't find the corresponding reload txn status when processing depositTx
    - will need to wait until the 
    
    
    - current flow
        - reload and escrow happens parallely
        - if escrow fails, it notifies admin
        - escrow cron is ran every 20 seconds so reload could complete before escrow.
 */
