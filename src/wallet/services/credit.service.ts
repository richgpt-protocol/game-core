import { BadRequestException, Injectable } from '@nestjs/common';
import { UserWallet } from '../entities/user-wallet.entity';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { CreditWalletTx } from '../entities/credit-wallet-tx.entity';
import { GameUsdTx } from '../entities/game-usd-tx.entity';
import { AddCreditDto } from '../dto/credit.dto';
import { Campaign } from 'src/campaign/entities/campaign.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ContractTransactionReceipt,
  JsonRpcProvider,
  parseUnits,
  Wallet,
} from 'ethers';
import { ReloadTx } from '../entities/reload-tx.entity';
import { ConfigService } from 'src/config/config.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { Deposit__factory } from 'src/contract';
import { MPC } from 'src/shared/mpc';
import { Mutex } from 'async-mutex';

@Injectable()
export class CreditService {
  GAMEUSD_TRANFER_INITIATOR: string;
  private readonly cronMutex: Mutex = new Mutex();
  constructor(
    @InjectRepository(UserWallet)
    private readonly userWalletRepository: Repository<UserWallet>,
    @InjectRepository(CreditWalletTx)
    private readonly creditWalletTxRepository: Repository<CreditWalletTx>,
    @InjectRepository(GameUsdTx)
    private readonly gameUsdTxRepository: Repository<GameUsdTx>,
    @InjectRepository(ReloadTx)
    private readonly reloadTxRepository: Repository<ReloadTx>,
    private readonly configService: ConfigService,
    private readonly adminNotificationService: AdminNotificationService,
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
  ) {
    this.GAMEUSD_TRANFER_INITIATOR = this.configService.get(
      'DEPOSIT_BOT_ADDRESS',
    );
  }

  async getCreditBalance(userId: number): Promise<number> {
    const userWallet = await this.userWalletRepository.findOne({
      where: { userId },
    });
    if (!userWallet) throw new BadRequestException('User wallet not found');
    return userWallet.creditBalance;
  }

  async addCredit(payload: AddCreditDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // Add credit to user
      const userWallet = await queryRunner.manager.findOne(UserWallet, {
        where: { walletAddress: payload.walletAddress },
      });

      if (!userWallet) {
        throw new BadRequestException('User wallet not found');
      }

      const today = new Date();
      const expirationDate = new Date(today.setDate(today.getDate() + 60));

      const creditWalletTx = new CreditWalletTx();
      creditWalletTx.amount = payload.amount;
      creditWalletTx.txType = 'CREDIT';
      creditWalletTx.status = 'P';
      creditWalletTx.walletId = userWallet.id;
      creditWalletTx.userWallet = userWallet;
      creditWalletTx.expirationDate = expirationDate;

      if (payload.campaignId) {
        const campaign = await queryRunner.manager.findOne(Campaign, {
          where: { id: payload.campaignId },
        });
        if (!campaign) {
          throw new BadRequestException('Campaign not found');
        }
        creditWalletTx.campaign = campaign;
      }

      await queryRunner.manager.save(creditWalletTx);

      const gameUsdTx = new GameUsdTx();
      gameUsdTx.amount = payload.amount;
      gameUsdTx.status = 'P';
      gameUsdTx.txHash = null;
      gameUsdTx.receiverAddress = userWallet.walletAddress;
      gameUsdTx.senderAddress = this.GAMEUSD_TRANFER_INITIATOR;
      gameUsdTx.chainId = +this.configService.get('GAMEUSD_CHAIN_ID');
      gameUsdTx.creditWalletTx = creditWalletTx;
      gameUsdTx.retryCount = 0;

      await queryRunner.manager.save(gameUsdTx);
      creditWalletTx.gameUsdTx = [gameUsdTx];
      await queryRunner.manager.save(creditWalletTx);

      await queryRunner.commitTransaction();

      return creditWalletTx;
    } catch (error) {
      console.log('catch block');
      console.error(error);

      await queryRunner.rollbackTransaction();

      if (error instanceof BadRequestException) {
        return new BadRequestException(error.message);
      } else {
        return new BadRequestException('Failed to add credit');
      }
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  async getCreditWalletTxList(
    userId: number,
    page: number = 1,
    limit: number = 10,
  ) {
    try {
      const userWallet = await this.userWalletRepository.findOne({
        where: { userId },
      });
      if (!userWallet) throw new BadRequestException('User wallet not found');
      const [creditWalletTx, total] =
        await this.creditWalletTxRepository.findAndCount({
          where: { walletId: userWallet.id },
          relations: ['userWallet'],
          order: { createdDate: 'DESC' },
          skip: (page - 1) * limit,
          take: limit,
        });

      const data = creditWalletTx.map((tx: CreditWalletTx) => {
        return {
          id: tx.id,
          amount: tx.amount.toFixed(2),
          txType: tx.txType,
          status: tx.status,
          gameUsdTxStatus: tx.gameUsdTx[0]?.status,
          createdDate: tx.createdDate,
          walletAddress: tx.userWallet?.walletAddress,
          userId: tx.userWallet?.userId,
          explorerUrl:
            this.configService.get('EXPLORER_BASE_URL') +
            '/address/' +
            tx.gameUsdTx[0]?.senderAddress,
        };
      });
      return { data, total: Math.ceil(total / limit), currentPage: page };
    } catch (error) {
      console.error(error);
      throw new BadRequestException('Failed to get credit wallet tx list');
    }
  }

  async getAllCreditWalletTxList(page: number = 1, limit: number = 10) {
    try {
      const [creditWalletTx, total] = await this.creditWalletTxRepository
        .createQueryBuilder('creditWalletTx')
        .leftJoinAndSelect('creditWalletTx.userWallet', 'userWallet')
        .leftJoinAndSelect('creditWalletTx.gameUsdTx', 'gameUsdTx')
        .orderBy('creditWalletTx.createdDate', 'DESC')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();
      // await this.creditWalletTxRepository.findAndCount({
      //   relations: ['gameUsdTx', 'userWallet'],
      //   order: { createdDate: 'DESC' },
      //   skip: (page - 1) * limit,
      //   take: limit,
      // });

      const data = creditWalletTx.map((tx: CreditWalletTx) => {
        return {
          id: tx.id,
          amount: Number(tx.amount).toFixed(2),
          txType: tx.txType,
          status: tx.status,
          gameUsdTxStatus: tx.gameUsdTx[0]?.status,
          createdDate: tx.createdDate,
          walletAddress: tx.userWallet?.walletAddress,
          userId: tx.userWallet?.userId,
          explorerUrl:
            this.configService.get('EXPLORER_BASE_URL') +
            '/address/' +
            tx.gameUsdTx[0]?.senderAddress,
        };
      });
      return { data, total: Math.ceil(total / limit), currentPage: page };
    } catch (error) {
      console.error(error);
      throw new BadRequestException('Failed to get credit wallet tx list');
    }
  }

  private async getSigner(chainId: number, address: string): Promise<Wallet> {
    const providerUrl = this.configService.get(`PROVIDER_URL_${chainId}`);
    const provider = new JsonRpcProvider(providerUrl);
    const signerPrivKey = await MPC.retrievePrivateKey(address);

    return new Wallet(signerPrivKey, provider);
  }

  private async depositGameUSD(to: string, amount: bigint, signer: Wallet) {
    const depositContractAddress = this.configService.get(
      'DEPOSIT_CONTRACT_ADDRESS',
    );
    const depositContract = Deposit__factory.connect(
      depositContractAddress,
      signer,
    );
    const gasLimit = await depositContract.deposit.estimateGas(to, amount);
    return await depositContract.deposit(to, amount, {
      gasLimit: gasLimit + (gasLimit * BigInt(30)) / BigInt(100),
    });
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleGameUsdTx() {
    const release = await this.cronMutex.acquire();

    //top try-catch to release the mutex on query error
    try {
      const pendingGameUsdTx = await this.gameUsdTxRepository
        .createQueryBuilder('gameUsdTx')
        .leftJoinAndSelect('gameUsdTx.creditWalletTx', 'creditWalletTx')
        .where('gameUsdTx.status = :status', { status: 'P' })
        .andWhere('gameUsdTx.retryCount < 5')
        .andWhere('creditWalletTxId IS NOT NULL')
        .getMany();

      for (const tx of pendingGameUsdTx) {
        console.log('Processing credit gameUsd tx:', tx.id);
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        //Outer try-catch block to handle the transaction and release the queryRunner
        try {
          const gameUsdTx = await queryRunner.manager
            .createQueryBuilder(GameUsdTx, 'gameUsdTx')
            .leftJoinAndSelect('gameUsdTx.creditWalletTx', 'creditWalletTx')
            .leftJoinAndSelect('creditWalletTx.userWallet', 'userWallet')
            .where('gameUsdTx.id = :id', { id: tx.id })
            .getOne();

          if (gameUsdTx.retryCount >= 5) {
            gameUsdTx.status = 'F';
            await queryRunner.manager.save(gameUsdTx);

            await this.adminNotificationService.setAdminNotification(
              'Failed to credit user; GAMEUSD transfer failed',
              `CREDIT_TRANSFER_FAILED`,
              `CREDIT_TRANSFER_FAILED: ${gameUsdTx.id}`,
              false,
            );
            continue;
          }

          let receipt: ContractTransactionReceipt;
          //Inner try-catch block to handle the onchainTx and retryCount
          try {
            const signer = await this.getSigner(
              gameUsdTx.chainId,
              gameUsdTx.senderAddress,
            );
            const onchainTx = await this.depositGameUSD(
              gameUsdTx.receiverAddress,
              parseUnits(gameUsdTx.amount.toString(), 18),
              signer,
            );

            receipt = await onchainTx.wait(2);

            if (receipt && receipt.status != 1) {
              throw new Error('Transaction failed');
            }
          } catch (error) {
            console.error(error);
            gameUsdTx.retryCount += 1;
            await queryRunner.manager.save(gameUsdTx);
            continue;
          }

          gameUsdTx.txHash = receipt.hash;
          gameUsdTx.status = 'S';
          gameUsdTx.creditWalletTx.status = 'S';

          const lastValidCreditWalletTx = await queryRunner.manager.findOne(
            CreditWalletTx,
            {
              where: {
                userWallet: gameUsdTx.creditWalletTx.userWallet,
                status: 'S',
              },
              order: {
                updatedDate: 'DESC',
              },
            },
          );
          gameUsdTx.creditWalletTx.startingBalance =
            lastValidCreditWalletTx?.endingBalance || 0;
          const endingBalance =
            Number(lastValidCreditWalletTx?.endingBalance || 0) +
            Number(gameUsdTx.amount);
          gameUsdTx.creditWalletTx.endingBalance = endingBalance;
          gameUsdTx.creditWalletTx.userWallet.creditBalance = endingBalance;

          await queryRunner.manager.save(gameUsdTx);
          await queryRunner.manager.save(gameUsdTx.creditWalletTx);
          await queryRunner.manager.save(gameUsdTx.creditWalletTx.userWallet);
        } catch (error) {
          console.error(error);
          await queryRunner.rollbackTransaction();
        } finally {
          if (!queryRunner.isReleased) await queryRunner.release();
        }
      }

      release();
    } catch (error) {
      console.error(error);
      release();
    }
  }
}
