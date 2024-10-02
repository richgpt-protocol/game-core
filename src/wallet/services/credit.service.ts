import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { UserWallet } from '../entities/user-wallet.entity';
import {
  DataSource,
  In,
  MoreThan,
  Not,
  QueryRunner,
  Repository,
} from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { CreditWalletTx } from '../entities/credit-wallet-tx.entity';
import { GameUsdTx } from '../entities/game-usd-tx.entity';
import { AddCreditDto } from '../dto/credit.dto';
import { Campaign } from 'src/campaign/entities/campaign.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ethers, JsonRpcProvider, parseUnits, Wallet } from 'ethers';
import { ReloadTx } from '../entities/reload-tx.entity';
import { ConfigService } from 'src/config/config.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { Deposit__factory, GameUSD__factory } from 'src/contract';
import { MPC } from 'src/shared/mpc';
import { Mutex } from 'async-mutex';
import { Job } from 'bullmq';
import { QueueService } from 'src/queue/queue.service';
import { QueueName, QueueType } from 'src/shared/enum/queue.enum';
@Injectable()
export class CreditService {
  private readonly logger = new Logger(CreditService.name);
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
    private readonly queueService: QueueService,
  ) {
    this.GAMEUSD_TRANFER_INITIATOR = this.configService.get(
      'DEPOSIT_BOT_ADDRESS',
    );
  }

  onModuleInit() {
    this.queueService.registerHandler(
      QueueName.CREDIT,
      QueueType.SUBMIT_CREDIT,
      {
        jobHandler: this.process.bind(this),
        failureHandler: this.onFailed.bind(this),
      },
    );

    this.queueService.registerHandler(
      QueueName.CREDIT,
      QueueType.REVOKE_CREDIT,
      {
        jobHandler: this.processRevokeCredit.bind(this),
        failureHandler: this.revokeCreditFailed.bind(this),
      },
    );
  }

  // async getCreditBalance(userId: number): Promise<number> {
  //   const userWallet = await this.userWalletRepository.findOne({
  //     where: { userId },
  //   });
  //   if (!userWallet) throw new BadRequestException('User wallet not found');
  //   return userWallet.creditBalance;
  // }

  async addCredit(payload: AddCreditDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const creditWalletTx = await this._addCredit(payload, queryRunner);
      await queryRunner.commitTransaction();

      await this.addToQueue(creditWalletTx.id);

      return creditWalletTx;
    } catch (error) {
      console.log('catch block');
      this.logger.error(error);
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(error.message);
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  /// IMPORTANT: this.addToQueue(creditWalletTx.id); SHOULD BE CALLED AFTER THIS METHOD and COMMITING THE TRANSACTION
  async addCreditMiniGame(payload: AddCreditDto, queryRunner: QueryRunner) {
    try {
      return await this._addCredit(payload, queryRunner, true);
    } catch (error) {
      this.logger.error(error);
      throw new Error(error.message);
    }
  }

  async addToQueue(creditWalletTxId: number) {
    const jobId = `addCredit-${creditWalletTxId}`;
    await this.queueService.addJob(
      QueueName.CREDIT,
      jobId,
      {
        creditWalletTxId: creditWalletTxId,
        queueType: QueueType.SUBMIT_CREDIT,
      },
      3000,
    );
    return true;
  }

  /// IMPORTANT: this.addToQueue(creditWalletTx.id); SHOULD BE CALLED COMMITING THE TRANSACTION
  private async _addCredit(
    payload: AddCreditDto,
    queryRunner: QueryRunner,
    isGameTx: boolean = false,
  ) {
    try {
      const userWallet = await queryRunner.manager.findOne(UserWallet, {
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

      const today = new Date();
      const expirationDate = new Date(today.setDate(today.getDate() + 90));

      //update or insert credit wallet tx
      const creditWalletTx = new CreditWalletTx();
      creditWalletTx.amount = payload.amount;
      creditWalletTx.txType = isGameTx ? 'GAME_TRANSACTION' : 'CREDIT';
      creditWalletTx.status = 'P';
      creditWalletTx.walletId = userWallet.id;
      creditWalletTx.userWallet = userWallet;
      creditWalletTx.expirationDate = expirationDate;

      if (payload.campaignId) {
        const campaign = await queryRunner.manager.findOne(Campaign, {
          where: { id: payload.campaignId },
        });
        creditWalletTx.campaign = campaign;
      }

      await queryRunner.manager.save(creditWalletTx);

      const gameUsdTx = new GameUsdTx();
      gameUsdTx.amount = payload.amount;
      gameUsdTx.status = 'P';
      gameUsdTx.txHash = null;
      gameUsdTx.receiverAddress = userWallet.walletAddress;
      gameUsdTx.senderAddress = this.GAMEUSD_TRANFER_INITIATOR;
      gameUsdTx.chainId = +this.configService.get('BASE_CHAIN_ID');
      gameUsdTx.creditWalletTx = creditWalletTx;
      gameUsdTx.retryCount = 0;

      await queryRunner.manager.save(gameUsdTx);
      creditWalletTx.gameUsdTx = [gameUsdTx];
      await queryRunner.manager.save(creditWalletTx);

      return creditWalletTx;
    } catch (error) {
      this.logger.error(error);
      if (error instanceof BadRequestException) {
        throw new BadRequestException(error.message);
      } else {
        throw new BadRequestException('Failed to add credit');
      }
    }
  }

  async retryCreditTx(creditWalletTxId: number) {
    try {
      const creditWalletTx = await this.creditWalletTxRepository.findOne({
        where: { id: creditWalletTxId, status: Not('S') },
      });

      if (!creditWalletTx) {
        throw new BadRequestException('Credit wallet tx not found');
      }

      await this.queueService.addJob(
        QueueName.CREDIT,
        `addCredit-${creditWalletTx.id}`,
        {
          creditWalletTxId: creditWalletTx.id,
          queueType: QueueType.SUBMIT_CREDIT,
        },
        3000,
      );

      return { message: 'Retry job added' };
    } catch (error) {
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
      this.logger.error(error);
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
      this.logger.error(error);
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

  private async getSigner(chainId: number, address: string): Promise<Wallet> {
    const providerUrl = this.configService.get(`PROVIDER_RPC_URL_${chainId}`);
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

  async process(
    job: Job<{ creditWalletTxId: number }, any, string>,
  ): Promise<any> {
    const { creditWalletTxId } = job.data;
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const creditWalletTx = await queryRunner.manager
        .createQueryBuilder(CreditWalletTx, 'creditWalletTx')
        .leftJoinAndSelect('creditWalletTx.gameUsdTx', 'gameUsdTx')
        .leftJoinAndSelect('creditWalletTx.userWallet', 'userWallet')
        .where('creditWalletTx.id = :id', { id: creditWalletTxId })
        .getOne();

      if (!creditWalletTx) {
        throw new Error('Credit wallet tx not found');
      }

      const gameUsdTx = creditWalletTx.gameUsdTx[0];
      const userWallet = creditWalletTx.userWallet;
      // throw new Error('Test error');

      const signer = await this.getSigner(
        gameUsdTx.chainId,
        gameUsdTx.senderAddress,
      );
      const onchainTx = await this.depositGameUSD(
        gameUsdTx.receiverAddress,
        parseUnits(gameUsdTx.amount.toString(), 18),
        signer,
      );

      const receipt = await onchainTx.wait(2);

      if (receipt && receipt.status != 1) {
        throw new Error('Transaction failed');
      }

      gameUsdTx.txHash = receipt.hash;
      gameUsdTx.status = 'S';
      creditWalletTx.status = 'S';

      const lastValidCreditWalletTx = await queryRunner.manager.findOne(
        CreditWalletTx,
        {
          where: {
            userWallet: userWallet,
            status: 'S',
          },
          order: {
            updatedDate: 'DESC',
          },
        },
      );
      creditWalletTx.startingBalance =
        lastValidCreditWalletTx?.endingBalance || 0;
      const endingBalance =
        Number(lastValidCreditWalletTx?.endingBalance || 0) +
        Number(gameUsdTx.amount);
      creditWalletTx.endingBalance = endingBalance;
      userWallet.creditBalance = endingBalance;

      await queryRunner.manager.save(gameUsdTx);
      await queryRunner.manager.save(creditWalletTx);
      await queryRunner.manager.save(userWallet);

      await queryRunner.commitTransaction();
    } catch (error) {
      this.logger.error(error);
      await queryRunner.rollbackTransaction();

      throw new Error('Failed to add credit');
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  async onFailed(job: Job<{ creditWalletTxId: number }, any, string>) {
    const { creditWalletTxId } = job.data;

    if (job.attemptsMade >= job.opts.attempts) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();

      try {
        await queryRunner.startTransaction();
        const creditWalletTx = await queryRunner.manager
          .createQueryBuilder(CreditWalletTx, 'creditWalletTx')
          .leftJoinAndSelect('creditWalletTx.gameUsdTx', 'gameUsdTx')
          .where('creditWalletTx.id = :id', { id: creditWalletTxId })
          .getOne();

        creditWalletTx.status = 'F';
        creditWalletTx.gameUsdTx[0].status = 'F';

        await queryRunner.manager.save(creditWalletTx);
        await queryRunner.manager.save(creditWalletTx.gameUsdTx[0]);

        await queryRunner.commitTransaction();
      } catch (error) {
        this.logger.error(error);
        await queryRunner.rollbackTransaction();
      } finally {
        if (!queryRunner.isReleased) await queryRunner.release();

        await this.adminNotificationService.setAdminNotification(
          `Failed to process credit wallet tx ${creditWalletTxId}`,
          'ADD_CREDIT_FAILED',
          'Failed to add credit',
          false,
        );
      }
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
      this.logger.error(error);
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
        .andWhere('creditWalletTx.txType IN (:...types)', {
          types: ['CREDIT', 'GAME_TRANSACTION'],
        })
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
            {
              walletId: tx.walletId,
              status: 'S',
              txType: In(['CREDIT', 'GAME_TRANSACTION']),
            },
            {
              status: 'E',
            },
          );

          const gameUsdTx = new GameUsdTx();
          gameUsdTx.amount = diff;
          gameUsdTx.chainId = +this.configService.get('BASE_CHAIN_ID');
          gameUsdTx.status = 'P';
          gameUsdTx.txHash = null;
          gameUsdTx.senderAddress = userWallet.walletAddress;
          gameUsdTx.receiverAddress = this.configService.get('GAMEUSD_POOL_CONTRACT_ADDRESS');
          gameUsdTx.retryCount = 0;
          gameUsdTx.creditWalletTx = creditWalletTx;
          await queryRunner.manager.save(gameUsdTx);

          await queryRunner.commitTransaction();

          const jobId = `addCredit-${creditWalletTx.id}`;
          await this.queueService.addJob(
            QueueName.CREDIT,
            jobId,
            {
              gameUsdTx: gameUsdTx,
              queueType: QueueType.REVOKE_CREDIT,
            },
            3000,
          );
        }
      }
    } catch (error) {
      this.logger.error(error);
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
  //     this.logger.error(error);
  //     await queryRunner.rollbackTransaction();
  //   } finally {
  //     if (!queryRunner.isReleased) await queryRunner.release();
  //   }
  // }

  async processRevokeCredit(
    job: Job<{
      gameUsdTx: GameUsdTx
    }, any, string>,
  ): Promise<any> {
    const { gameUsdTx } = job.data;

    // execute on-chain tx
    // check approval
    const user = await this.getSigner(
      gameUsdTx.chainId,
      gameUsdTx.senderAddress,
    );
    const gameUsdTokenContract = GameUSD__factory.connect(
      this.configService.get('GAMEUSD_CONTRACT_ADDRESS'),
      user
    )
    const depositContractAddress = this.configService.get(
      'DEPOSIT_CONTRACT_ADDRESS',
    );
    const allowance = await gameUsdTokenContract.allowance(
      gameUsdTx.senderAddress,
      depositContractAddress
    )
    if (allowance === ethers.toBigInt(0)) {
      const approveTx = await gameUsdTokenContract.approve(
        depositContractAddress,
        ethers.MaxUint256
      )
      await approveTx.wait()
    }
    // execute revoke credit function
    const depositBot = await this.getSigner(
      gameUsdTx.chainId,
      this.GAMEUSD_TRANFER_INITIATOR,
    );
    const depositContract = Deposit__factory.connect(
      depositContractAddress,
      depositBot,
    );
    const txResponse = await depositContract.revokeExpiredCredit(
      gameUsdTx.senderAddress,
      parseUnits(gameUsdTx.amount.toString(), 18),
    );
    const txReceipt = await txResponse.wait();

    if (txReceipt.status != 1) {
      // throw error to retry again in next job
      throw new Error(`Transaction failed, txHash: ${txReceipt.hash}`);
    }

    // update status in db
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.manager.update(GameUsdTx, gameUsdTx.id, {
        status: 'S',
        txHash: txReceipt.hash,
      });
      await queryRunner.commitTransaction();
    } catch (error) {
      this.logger.error(error);
      await queryRunner.rollbackTransaction();
    } finally {
      await queryRunner.release();
    }
  }

  async revokeCreditFailed(
    job: Job<{
      creditWalletTx: CreditWalletTx,
      gameUsdTx: GameUsdTx
    }, any, string>,
  ): Promise<any> {
    const { gameUsdTx } = job.data;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      if (job.attemptsMade >= job.opts.attempts) {
        gameUsdTx.status = 'F';
        await queryRunner.manager.save(gameUsdTx);
        await queryRunner.commitTransaction();

        // inform admin
        await this.adminNotificationService.setAdminNotification(
          `Failed to process revoke credit wallet on-chain, gameUsdTx id: ${gameUsdTx.id}`,
          'REVOKE_CREDIT_ONCHAIN_FAILED',
          'Failed to revoke credit on-chain',
          false,
        );
      } else {
        gameUsdTx.retryCount++;
        await queryRunner.manager.save(gameUsdTx);
        await queryRunner.commitTransaction();
      }
    } catch (error) {
      this.logger.error(error);
      await queryRunner.rollbackTransaction();
    } finally {
      await queryRunner.release();
    }
  }
}
