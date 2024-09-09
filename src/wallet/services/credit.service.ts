import { BadRequestException, Injectable } from '@nestjs/common';
import { UserWallet } from '../entities/user-wallet.entity';
import { DataSource, MoreThan, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { CreditWalletTx } from '../entities/credit-wallet-tx.entity';
import { GameUsdTx } from '../entities/game-usd-tx.entity';
import { AddCreditDto } from '../dto/credit.dto';
import { Campaign } from 'src/campaign/entities/campaign.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JsonRpcProvider, parseUnits, Wallet } from 'ethers';
import { ReloadTx } from '../entities/reload-tx.entity';
import { ConfigService } from 'src/config/config.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { Deposit__factory } from 'src/contract';
import { MPC } from 'src/shared/mpc';
import { Mutex } from 'async-mutex';
import { Job } from 'bullmq';
import { randomUUID } from 'crypto';
import { QueueService } from 'src/queue/queue.service';
@Injectable()
export class CreditService {
  GAMEUSD_TRANFER_INITIATOR: string;
  private readonly cronMutex: Mutex = new Mutex();
  QUEUE_NAME = 'CreditQueue';
  QUEUE_TYPE = 'CREDIT';
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
    private readonly queueService: QueueService,
  ) {
    this.GAMEUSD_TRANFER_INITIATOR = this.configService.get(
      'DEPOSIT_BOT_ADDRESS',
    );
  }

  onModuleInit() {
    this.queueService.registerHandler(this.QUEUE_NAME, this.QUEUE_TYPE, {
      jobHandler: this.process.bind(this),
      failureHandler: this.onFailed.bind(this),
    });
  }

  // async getCreditBalance(userId: number): Promise<number> {
  //   const userWallet = await this.userWalletRepository.findOne({
  //     where: { userId },
  //   });
  //   if (!userWallet) throw new BadRequestException('User wallet not found');
  //   return userWallet.creditBalance;
  // }

  async addCredit(payload: AddCreditDto) {
    try {
      const userWallet = this.userWalletRepository.findOne({
        where: { walletAddress: payload.walletAddress },
      });

      if (!userWallet) {
        throw new BadRequestException('User wallet not found');
      }

      if (payload.campaignId) {
        const campaign = await this.dataSource.manager.findOne(Campaign, {
          where: { id: payload.campaignId },
        });
        if (!campaign) {
          throw new BadRequestException('Campaign not found');
        }
      }

      const jobId = `addCredit-${randomUUID()}`;
      await this.queueService.addJob(this.QUEUE_NAME, jobId, {
        ...payload,
        queueType: this.QUEUE_TYPE,
      });
    } catch (error) {
      console.log('catch block');
      console.error(error);
      if (error instanceof BadRequestException) {
        throw new BadRequestException(error.message);
      } else {
        throw new BadRequestException('Failed to add credit');
      }
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
      const [creditWalletTx, total] = await this.creditWalletTxRepository
        .createQueryBuilder('creditWalletTx')
        .leftJoinAndSelect('creditWalletTx.userWallet', 'userWallet')
        .leftJoinAndSelect('creditWalletTx.gameUsdTx', 'gameUsdTx')
        .orderBy('creditWalletTx.createdDate', 'DESC')
        .where('creditWalletTx.walletId = :walletId', {
          walletId: userWallet.id,
        })
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

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

  async getCreditBalance(userId: number): Promise<number> {
    const userWallet = await this.userWalletRepository.findOne({
      where: { userId },
    });
    if (!userWallet) throw new BadRequestException('User wallet not found');

    const nonExpiredCreditWalletTx = await this.creditWalletTxRepository.find({
      where: { walletId: userWallet.id, expirationDate: MoreThan(new Date()) },
    });

    const nonExpiredBalance = nonExpiredCreditWalletTx.reduce(
      (acc, tx) => acc + tx.amount,
      0,
    );
    return Math.min(
      Number(userWallet.creditBalance),
      Number(nonExpiredBalance),
    );
  }

  async process(job: Job<AddCreditDto, any, string>): Promise<any> {
    const payload = job.data;
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // process the credit tx here

      await queryRunner.commitTransaction();
    } catch (error) {
      console.error(error);
      await queryRunner.rollbackTransaction();

      throw new Error('Failed to add credit');
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  async onFailed(job: Job<AddCreditDto, any, string>) {
    const payload = job.data;

    if (job.attemptsMade >= job.opts.attempts) {
      let message = `Failed to add ${payload.amount} credits to ${payload.walletAddress}`;
      if (payload.campaignId) message += ` for campaign ${payload.campaignId}`;
      this.adminNotificationService.setAdminNotification(
        message,
        'ADD_CREDIT_FAILED',
        'Failed to add credit',
        false,
      );
    }
  }

  expireCronMutex = new Mutex();
  @Cron(CronExpression.EVERY_10_SECONDS)
  async expireCreditsCron() {
    const release = await this.expireCronMutex.acquire();
    try {
      // won't get wrong, but will be heavy on db as it queries all the non-expired
      // credits everytime.
      await this.expireCredits();

      // Less heavey on db as it won't scan the same record twice.
      // But need to edit past transaction's status.
      // await this.expireCreditsMethod2();
    } catch (error) {
      console.error(error);
    } finally {
      release();
    }
  }

  // Less heavey on db as it won't scan the same record twice.
  // But need to edit past transaction's status.
  async expireCredits() {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const expiredCreditWalletTxns = await queryRunner.manager
        .createQueryBuilder(CreditWalletTx, 'creditWalletTx')
        .innerJoin('creditWalletTx.userWallet', 'userWallet')
        .select([
          'SUM(creditWalletTx.amount) as totalAmount',
          'userWallet.id As walletId',
          'userWallet.creditBalance as creditBalance',
        ])
        .where('creditWalletTx.expirationDate < :expirationDate', {
          expirationDate: new Date(),
        })
        .andWhere('creditWalletTx.txType = :type', { type: 'CREDIT' })
        .andWhere('creditWalletTx.status = :status', { status: 'S' })
        .groupBy('userWallet.id')
        .getRawMany();

      for (const tx of expiredCreditWalletTxns) {
        const expiredAmount = Number(tx.totalAmount) || 0;
        const activeCredit = Math.max(
          Number(tx.creditBalance) - expiredAmount,
          0,
        );

        const diff = Number(tx.creditBalance) - activeCredit;

        if (diff > 0) {
          console.log('Expiring credit for wallet:', tx.walletId);
          const creditWalletTx = new CreditWalletTx();
          creditWalletTx.amount = diff;
          creditWalletTx.txType = 'EXPIRY';
          creditWalletTx.status = 'S';
          creditWalletTx.walletId = tx.walletId;
          creditWalletTx.userWallet = tx.walletId;
          creditWalletTx.startingBalance = tx.creditBalance;
          creditWalletTx.endingBalance = activeCredit;

          await queryRunner.manager.save(creditWalletTx);

          const userWallet = await queryRunner.manager.findOne(UserWallet, {
            where: { id: tx.walletId },
          });

          userWallet.creditBalance = activeCredit;
          await queryRunner.manager.save(userWallet);

          await queryRunner.manager.update(
            CreditWalletTx,
            { walletId: tx.walletId, status: 'S', txType: 'CREDIT' },
            {
              status: 'E',
            },
          );

          await queryRunner.commitTransaction();
        }
      }
    } catch (error) {
      console.error(error);
      queryRunner.rollbackTransaction();
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  // won't get wrong, but will be heavy on db as it queries all the non-expired
  // credits everytime.
  // async expireCredits() {
  //   const queryRunner = this.dataSource.createQueryRunner();
  //   await queryRunner.connect();
  //   await queryRunner.startTransaction();

  //   try {
  //     const nonExpiredCreditWalletTxns = await queryRunner.manager
  //       .createQueryBuilder(CreditWalletTx, 'creditWalletTx')
  //       .innerJoin('creditWalletTx.userWallet', 'userWallet')
  //       .select([
  //         'SUM(creditWalletTx.amount) as totalAmount',
  //         'userWallet.id As walletId',
  //         'userWallet.creditBalance as creditBalance',
  //       ])
  //       .where('creditWalletTx.expirationDate > :expirationDate', {
  //         expirationDate: new Date(),
  //       })
  //       .andWhere('creditWalletTx.txType = :type', { type: 'CREDIT' })
  //       .andWhere('creditWalletTx.status = :status', { status: 'S' })
  //       .groupBy('userWallet.id')
  //       .getRawMany();

  //     // console.log('nonExpiredCreditWalletTxns', nonExpiredCreditWalletTxns);

  //     for (const tx of nonExpiredCreditWalletTxns) {
  //       const nonEXpiredAmount = Number(tx.totalAmount) || 0;

  //       console.log('nonEXpiredAmount', nonEXpiredAmount);
  //       console.log('creditBalance', tx.creditBalance);

  //       //non expired credit is the maximum valid credit balance.
  //       //User could have used some of it already, so its the minimum of the two.
  //       const activeCredit = Math.min(
  //         Number(tx.creditBalance),
  //         nonEXpiredAmount,
  //       );

  //       // console.log('activeCredit', activeCredit);

  //       const diff = Number(tx.creditBalance) - activeCredit;
  //       // console.log('diff', diff);

  //       if (diff > 0) {
  //         console.log('Expiring credit for wallet:', tx.walletId);
  //         const creditWalletTx = new CreditWalletTx();
  //         creditWalletTx.amount = diff;
  //         creditWalletTx.txType = 'EXPIRY';
  //         creditWalletTx.status = 'S';
  //         creditWalletTx.walletId = tx.walletId;
  //         creditWalletTx.userWallet = tx.walletId;
  //         creditWalletTx.startingBalance = tx.creditBalance;
  //         creditWalletTx.endingBalance = activeCredit;

  //         await queryRunner.manager.save(creditWalletTx);

  //         const userWallet = await queryRunner.manager.findOne(UserWallet, {
  //           where: { id: tx.walletId },
  //         });

  //         userWallet.creditBalance = activeCredit;
  //         await queryRunner.manager.save(userWallet);
  //       }

  //       await queryRunner.commitTransaction();
  //     }
  //   } catch (error) {
  //     console.error(error);
  //     await queryRunner.rollbackTransaction();
  //   } finally {
  //     if (!queryRunner.isReleased) await queryRunner.release();
  //   }
  // }
}
