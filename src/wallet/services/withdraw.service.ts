import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, Repository } from 'typeorm';
import { UserWallet } from '../entities/user-wallet.entity';
import { WalletTx } from '../entities/wallet-tx.entity';
import { BytesLike, ethers } from 'ethers';
import {
  Deposit__factory,
  GameUSD__factory,
  Payout__factory,
} from 'src/contract';
import { RedeemDto } from '../dto/redeem.dto';
import { RedeemTx } from '../entities/redeem-tx.entity';
import { UserNotification } from 'src/notification/entities/user-notification.entity';
import { Notification } from 'src/notification/entities/notification.entity';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GameUsdTx } from '../entities/game-usd-tx.entity';
import { Admin } from 'src/admin/entities/admin.entity';
import { Setting } from 'src/setting/entities/setting.entity';
import { User } from 'src/user/entities/user.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WalletService } from '../wallet.service';
import { UserService } from 'src/user/user.service';
import { MPC } from 'src/shared/mpc';
import * as bcrypt from 'bcrypt';
import { QueueService } from 'src/queue/queue.service';
import { Job } from 'bullmq';
import { Mutex } from 'async-mutex';
import { ReviewRedeemDto } from '../dto/ReviewRedeem.dto';
import { QueueName, QueueType } from 'src/shared/enum/queue.enum';
import { ConfigService } from 'src/config/config.service';
import { TxStatus } from 'src/shared/enum/status.enum';
import { WalletTxType } from 'src/shared/enum/txType.enum';

type RedeemResponse = {
  error: string;
  data: any;
};

// type RequestRedeemEvent = {
//   userId: number;
//   txHash: string;
//   walletTxId: number;
//   redeemTxId: number;
//   gameUsdTxId: number;
// };

@Injectable()
export class WithdrawService implements OnModuleInit {
  private readonly logger = new Logger(WithdrawService.name);
  // provider = new ethers.JsonRpcProvider(process.env.OPBNB_PROVIDER_RPC_URL);
  payoutCronMutex: Mutex;
  constructor(
    @InjectRepository(UserWallet)
    private userWalletRepository: Repository<UserWallet>,
    @InjectRepository(WalletTx)
    private walletTxRepository: Repository<WalletTx>,
    @InjectRepository(RedeemTx)
    private redeemTxRepository: Repository<RedeemTx>,
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(UserNotification)
    private userNotificationRepository: Repository<UserNotification>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Admin)
    private adminRepository: Repository<Admin>,
    @InjectRepository(GameUsdTx)
    private gameUsdTxRepository: Repository<GameUsdTx>,
    @InjectRepository(Setting)
    private settingRepository: Repository<Setting>,
    private dataSource: DataSource,
    private adminNotificationService: AdminNotificationService,
    private walletService: WalletService,
    private eventEmitter: EventEmitter2,
    private userService: UserService,
    private readonly queueService: QueueService,
    private configService: ConfigService,
  ) {
    this.payoutCronMutex = new Mutex();
  }

  onModuleInit() {
    this.queueService.registerHandler(
      QueueName.WITHDRAW,
      QueueType.PROCESS_WITHDRAW,
      {
        jobHandler: this.processWithdraw.bind(this),
        failureHandler: this.onJobFailed.bind(this),
      },
    );

    this.queueService.registerHandler(
      QueueName.WITHDRAW,
      QueueType.PROCESS_PAYOUT,
      {
        jobHandler: this.handlePayout.bind(this),
        failureHandler: this.onJobFailed.bind(this),
      },
    );
  }

  // how redeem & payout work
  // 1. user request redeem via /request-redeem
  // 2. if redeem < $100, proceed with processWithdraw() queue. else, pending admin to execute reviewAdmin()
  // 3. processWithdraw() queue transfers the gameUSD from user wallet to GameUSDPool contract.
  // 4. local server redeem bot run every 5 minutes to check if any pending redeem request,
  //    generate signature for the redeem request & update directly through backend database
  // 5. payout() run every 5 minutes to execute payout if any

  async requestRedeem(
    userId: number,
    payload: RedeemDto,
  ): Promise<RedeemResponse> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.startTransaction();
      const user = await queryRunner.manager
        .createQueryBuilder(User, 'user')
        .leftJoinAndSelect('user.wallet', 'wallet')
        .where('user.id = :userId', { userId })
        .getOne();
      const userWallet = user.wallet;

      if (!user.withdrawPin) {
        return {
          error: 'Please set withdraw password',
          data: null,
        };
      }
      const verified = await bcrypt.compare(
        payload.withdrawPin,
        user.withdrawPin,
      );
      if (!verified) {
        return {
          error: 'Please check withdraw password',
          data: null,
        };
      }

      if (payload.amount < 1) {
        return {
          error: 'Minimum withdrawable amount is $1',
          data: null,
        };
      }

      const pendingAmountResult = await queryRunner.manager.query(
        `SELECT SUM(txAmount) as pendingAmount FROM wallet_tx 
          WHERE
            userWalletId = ${user.wallet.id} AND 
            txType IN ('REDEEM', 'PLAY', 'INTERNAL_TRANSFER') AND
            status IN ('P', 'PD', 'PA')`,
      );
      const pendingAmount = Number(pendingAmountResult[0]?.pendingAmount) || 0;
      const actualWalletBalance =
        pendingAmount >= userWallet.walletBalance
          ? 0
          : userWallet.walletBalance - pendingAmount;
      if (actualWalletBalance < payload.amount) {
        return {
          error: 'Insufficient redeemable balance',
          data: null,
        };
      }
      const userLevel = this.walletService.calculateLevel(
        userWallet.pointBalance,
      );
      if (userLevel < 10) {
        return {
          error: 'Insufficient level to redeem',
          data: null,
        };
      }

      const lastPendingRedeemWalletTx = await queryRunner.manager.findOne(
        WalletTx,
        {
          where: [
            {
              txType: WalletTxType.REDEEM,
              userWalletId: userWallet.id,
              status: TxStatus.PENDING,
            },
            {
              txType: WalletTxType.REDEEM,
              userWalletId: userWallet.id,
              status: TxStatus.PENDING_DEVELOPER,
            },
            {
              txType: WalletTxType.REDEEM,
              userWalletId: userWallet.id,
              status: TxStatus.PENDING_ADMIN,
            },
          ],
        },
      );

      if (lastPendingRedeemWalletTx) {
        return { error: 'Previous withdrawal is in progress', data: null };
      }

      const setting = await queryRunner.manager.findOne(Setting, {
        where: { key: `WITHDRAWAL_FEES_${payload.chainId}` },
      });

      const redeemTx = this.redeemTxRepository.create({
        payoutNote: null,
        payoutCanProceed: null,
        payoutCheckedAt: null,
        payoutSignature: null,
        payoutTxHash: null,
        payoutStatus: null,
        fromAddress: userWallet.walletAddress,
        receiverAddress: payload.receiverAddress,
        isPayoutTransferred: false,
        chainId: payload.chainId,
        fees: setting ? Number(setting.value) * payload.amount : 0,
        tokenSymbol: payload.tokenSymbol,
        tokenAddress: payload.tokenAddress,
        amount: payload.amount,
        amountInUSD: payload.amount,
        reviewedBy: null,
        admin: null,
        walletTx: null,
      });
      await queryRunner.manager.save(redeemTx);

      const walletTx = this.walletTxRepository.create({
        txType: WalletTxType.REDEEM,
        txAmount: payload.amount,
        txHash: null,
        status: TxStatus.PENDING,
        startingBalance: null,
        endingBalance: null,
        userWalletId: userWallet.id,
        redeemTx,
        gameUsdTx: null,
      });
      await queryRunner.manager.save(walletTx);

      redeemTx.walletTx = walletTx;
      await queryRunner.manager.save(redeemTx);

      const gameUsdTx = this.gameUsdTxRepository.create({
        amount: redeemTx.amount,
        chainId: Number(this.configService.get('BASE_CHAIN_ID')),
        status: TxStatus.PENDING,
        txHash: null,
        senderAddress: userWallet.walletAddress,
        receiverAddress: this.configService.get(
          'GAMEUSD_POOL_CONTRACT_ADDRESS',
        ),
        retryCount: 0,
        walletTxId: walletTx.id,
      });
      await queryRunner.manager.save(gameUsdTx);
      walletTx.gameUsdTx = gameUsdTx;
      await queryRunner.manager.save(walletTx);

      const lastSuccessfulRedeemWalletTx = await queryRunner.manager.findOne(
        WalletTx,
        {
          where: {
            userWalletId: userWallet.id,
            txType: WalletTxType.REDEEM,
            status: TxStatus.SUCCESS,
          },
          order: { updatedDate: 'DESC' },
        },
      );
      const isFirstRedeem = lastSuccessfulRedeemWalletTx === null;
      const isLastRedeemAfter24Hours =
        lastSuccessfulRedeemWalletTx !== null &&
        lastSuccessfulRedeemWalletTx.updatedDate <
          new Date(Date.now() - 24 * 60 * 60 * 1000);

      if (
        redeemTx.amount < 100 &&
        (isFirstRedeem || isLastRedeemAfter24Hours)
      ) {
        await queryRunner.commitTransaction();

        const jobId = `process_withdraw_${walletTx.id}`;
        await this.queueService.addJob(QueueName.WITHDRAW, jobId, {
          userId,
          payoutNote: 'This request redeem proceed automatically(criteria met)',
          reviewedBy: 999, // system auto payout
          redeemTxId: redeemTx.id,
          walletTxId: walletTx.id,
          gameUsdTxId: gameUsdTx.id,
          chainId: payload.chainId,
          queueType: QueueType.PROCESS_WITHDRAW,
        });

        await this.adminNotificationService.setAdminNotification(
          `User ${userId} has requested withdrawal for amount $${payload.amount} and process automatically(criteria met).`,
          'info',
          'Redeem Request',
          false,
          true,
        );
      } else {
        walletTx.status = TxStatus.PENDING_ADMIN; // pending for admin review
        await queryRunner.manager.save(walletTx);
        await queryRunner.commitTransaction();

        await this.adminNotificationService.setAdminNotification(
          `User ${userId} has requested redeem for amount $${payload.amount}, please review via back-office. redeemTxId: ${redeemTx.id}`,
          'info',
          'Redeem Request',
          true,
          true,
        );
      }

      await this.userService.setUserNotification(userId, {
        type: 'redeem',
        title: 'Redeem Processed Successfully',
        message: `Your redeem of $${payload.amount} has been successfully processed and pending for review.`,
        walletTxId: walletTx.id,
      });

      // await this.adminNotificationService.setAdminNotification(
      //   `User ${userId} has requested withdrawl of amount ${payload.amount} USD`,
      //   'WITHDRAWL_REQUEST',
      //   'Withdraw Requested',
      //   false,
      //   true,
      // );

      return { error: null, data: redeemTx };
    } catch (error) {
      this.logger.error(error);
      await queryRunner.rollbackTransaction();

      await this.adminNotificationService.setAdminNotification(
        `Transaction in redeem.service.requestRedeem had been rollback, error: ${error}`,
        'rollbackTxError',
        'Transaction Rollbacked',
        true,
        true,
      );
      return {
        error: 'Unable to process withdraw request at the moment',
        data: null,
      };
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  async reviewAdmin(adminId: number, payload: ReviewRedeemDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const redeemTx = await queryRunner.manager
        .createQueryBuilder(RedeemTx, 'redeemTx')
        .leftJoinAndSelect('redeemTx.walletTx', 'walletTx')
        .leftJoinAndSelect('walletTx.gameUsdTx', 'gameUsdTx')
        .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
        .where('redeemTx.id = :redeemTxId', { redeemTxId: payload.redeemTxId })
        .getOne();

      if (!redeemTx)
        return {
          error: 'Redeem not found',
          data: null,
        };

      const walletTx = redeemTx.walletTx;
      const userWallet = walletTx.userWallet;

      redeemTx.admin =
        adminId === 999
          ? null
          : await this.adminRepository.findOneBy({ id: adminId });
      redeemTx.reviewedBy = adminId;
      redeemTx.payoutCanProceed = payload.payoutCanProceed;
      await queryRunner.manager.save(redeemTx);
      walletTx.status = payload.payoutCanProceed
        ? TxStatus.PENDING
        : TxStatus.FAILED;
      await queryRunner.manager.save(walletTx);

      if (payload.payoutCanProceed) {
        await queryRunner.commitTransaction();

        const jobId = `process_withdraw_${redeemTx.walletTx.id}`;
        await this.queueService.addJob(QueueName.WITHDRAW, jobId, {
          userId: userWallet.userId,
          payoutNote: payload.payoutNote,
          reviewedBy: adminId,
          redeemTxId: redeemTx.id,
          walletTxId: walletTx.id,
          gameUsdTxId: walletTx.gameUsdTx.id,
          chainId: redeemTx.chainId,
          queueType: QueueType.PROCESS_WITHDRAW,
        });
      } else {
        // payout rejected
        redeemTx.payoutNote = payload.payoutNote;
        redeemTx.payoutCheckedAt = new Date();
        redeemTx.payoutStatus = TxStatus.FAILED;
        await queryRunner.manager.save(redeemTx);
        walletTx.status = TxStatus.FAILED;
        await queryRunner.manager.save(walletTx);
        await queryRunner.commitTransaction();

        await this.userService.setUserNotification(walletTx.userWalletId, {
          type: 'review redeem',
          title: 'Redeem Request Rejected',
          message: `Your redeem request for amount $${Number(walletTx.txAmount)} has been rejected. Please contact admin for more information.`,
          walletTxId: walletTx.id,
        });
      }
      return { error: null, data: redeemTx };
    } catch (error) {
      this.logger.error('reviewAdmin() error: ' + error);
      await queryRunner.rollbackTransaction();

      return { error: 'Unable to process review', data: null };
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  async processWithdraw(
    job: Job<{
      userId: number;
      payoutNote: string;
      reviewedBy: number;
      redeemTxId: number;
      walletTxId: number;
      gameUsdTxId: number;
      chainId: number;
    }>,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.startTransaction();
      const redeemTx = await queryRunner.manager.findOne(RedeemTx, {
        where: { id: job.data.redeemTxId },
        relations: { walletTx: true },
      });
      const walletTx = await queryRunner.manager.findOne(WalletTx, {
        where: { id: job.data.walletTxId },
        relations: { userWallet: true },
      });
      const gameUsdTx = await queryRunner.manager.findOne(GameUsdTx, {
        where: { id: job.data.gameUsdTxId },
      });

      if (gameUsdTx.txHash) {
        //This block is reached when the same redeemTxId is added to the queue again (by reviewAdmin())
        return;
      }

      const usdtBalance = await this.getUsdtBalance(job.data.chainId);

      if (usdtBalance < ethers.parseEther(redeemTx.amount.toString())) {
        // send notification to admin for reload payout pool
        await this.adminNotificationService.setAdminNotification(
          `Payout contract has insufficient USDT to payout for amount $${redeemTx.amount}. Please reload payout pool.`,
          'error',
          'Payout Pool Reload',
          true,
          true,
        );

        walletTx.status = TxStatus.PENDING_DEVELOPER;
        await queryRunner.manager.save(walletTx);
        await queryRunner.commitTransaction();

        return;
      }

      redeemTx.reviewedBy = job.data.reviewedBy;
      redeemTx.payoutNote = job.data.payoutNote;
      redeemTx.payoutCheckedAt = new Date();
      await queryRunner.manager.save(redeemTx);

      await this.approveGameUsdToken(
        walletTx.userWallet.walletAddress,
        Number(redeemTx.amount) + Number(redeemTx.fees),
      );
      const receipt = await this.withdrawGameUSD(
        walletTx.userWallet.walletAddress,
        redeemTx.amount,
        redeemTx.fees,
      );

      if (!receipt || receipt.status != 1) {
        throw new Error('Withdraw(Step1) failed');
      }

      gameUsdTx.txHash = receipt.hash;
      gameUsdTx.status = TxStatus.SUCCESS;
      redeemTx.payoutStatus = TxStatus.PENDING;
      redeemTx.payoutCanProceed = true;
      redeemTx.walletTx.status = TxStatus.PENDING;

      await queryRunner.manager.save(redeemTx);
      await queryRunner.manager.save(gameUsdTx);
      await queryRunner.commitTransaction();
    } catch (error) {
      this.logger.error('processWithdraw() error: ', error);
      await queryRunner.rollbackTransaction();

      throw error; //re-tried by queue
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  private async handlePayout(
    job: Job<{
      redeemTxId: number;
    }>,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.startTransaction();
      const redeemTx = await queryRunner.manager
        .createQueryBuilder(RedeemTx, 'redeemTx')
        .leftJoinAndSelect('redeemTx.walletTx', 'walletTx')
        .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
        .where('redeemTx.id = :redeemTxId', { redeemTxId: job.data.redeemTxId })
        .andWhere('redeemTx.payoutSignature IS NOT NULL')
        .andWhere('redeemTx.payoutStatus = :payoutStatus', {
          payoutStatus: 'P',
        })
        .andWhere('redeemTx.isPayoutTransferred = :isPayoutTransferred', {
          isPayoutTransferred: false,
        })
        .andWhere('redeemTx.reviewedBy IS NOT NULL')
        .getOne();

      if (!redeemTx) return;

      const amountToTransfer = redeemTx.amount - redeemTx.fees;

      const receipt = await this.payoutUSDT(
        redeemTx.receiverAddress,
        amountToTransfer,
        redeemTx.chainId,
        redeemTx.payoutSignature,
      );

      if (!receipt || receipt.status != 1) {
        redeemTx.isPayoutTransferred = false;
        redeemTx.walletTx.status = TxStatus.PENDING_DEVELOPER;

        await queryRunner.commitTransaction();

        await this.adminNotificationService.setAdminNotification(
          `Payout for redeemTxId ${redeemTx.id} has failed. Please check.`,
          'error',
          'Payout Failed',
          true,
          true,
          redeemTx.walletTx.id,
        );
      } else {
        redeemTx.payoutTxHash = receipt.hash;
        // redeemTx.fromAddress = process.env.PAYOUT_BOT_ADDRESS;
        // const lastWalletTx = await queryRunner.manager.findOne(WalletTx, {
        //   where: {
        //     userWalletId: redeemTx.walletTx.userWalletId,
        //     status: 'S',
        //   },
        //   order: { updatedDate: 'DESC' },
        // });

        redeemTx.isPayoutTransferred = true;
        redeemTx.payoutStatus = TxStatus.SUCCESS;
        redeemTx.walletTx.status = TxStatus.SUCCESS;
        redeemTx.walletTx.startingBalance =
          redeemTx.walletTx.userWallet.walletBalance;
        redeemTx.walletTx.endingBalance =
          redeemTx.walletTx.userWallet.walletBalance -
          redeemTx.walletTx.txAmount;
        redeemTx.walletTx.userWallet.walletBalance =
          redeemTx.walletTx.endingBalance;

        await queryRunner.manager.save(redeemTx);
        await queryRunner.manager.save(redeemTx.walletTx);
        await queryRunner.manager.save(redeemTx.walletTx.userWallet);
        await queryRunner.commitTransaction();

        await this.userService.setUserNotification(
          redeemTx.walletTx.userWalletId,
          {
            type: 'payout',
            title: 'Payout Successfully',
            message: `Your payout for amount $${Number(redeemTx.amount)} has been processed successfully.`,
            walletTxId: redeemTx.walletTx.id,
          },
        );
      }
    } catch (error) {
      this.logger.error('handlePayout() error: ', error);
      await queryRunner.rollbackTransaction();

      throw new Error('Handle Payout errored'); //re-tried by queue
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  private async onJobFailed(job: Job) {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      if (job.attemptsMade >= job.opts.attempts) {
        await queryRunner.connect();
        await queryRunner.startTransaction();
        const redeemTx = await queryRunner.manager.findOne(RedeemTx, {
          where: { id: job.data.redeemTxId },
          relations: { walletTx: true },
        });
        const walletTx = await queryRunner.manager.findOne(WalletTx, {
          where: { id: redeemTx.walletTx.id },
        });
        walletTx.status = TxStatus.PENDING_DEVELOPER;
        redeemTx.payoutStatus = TxStatus.FAILED;
        await queryRunner.manager.save(walletTx);
        await queryRunner.manager.save(redeemTx);
        await queryRunner.commitTransaction();

        await this.adminNotificationService.setAdminNotification(
          `Failed to process redeemTxId: ${redeemTx.id}`,
          'error',
          'Payout Failed',
          true,
        );
      }
    } catch (error) {
      this.logger.error('onJobFailed() error: ', error);
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  private async approveGameUsdToken(from: string, minApproval: number) {
    // const providerUrl = process.env.OPBNB_PROVIDER_RPC_URL;
    // const provider = new ethers.JsonRpcProvider(providerUrl);
    const provider = new ethers.JsonRpcProvider(
      this.configService.get(
        'PROVIDER_RPC_URL_' + this.configService.get('BASE_CHAIN_ID'),
      ),
    );
    const signer = new ethers.Wallet(
      await MPC.retrievePrivateKey(from),
      provider,
    );
    const gameUsdTokenContract = GameUSD__factory.connect(
      this.configService.get('GAMEUSD_CONTRACT_ADDRESS'),
      signer,
    );

    const approvedAmount = await gameUsdTokenContract.allowance(
      from,
      this.configService.get('DEPOSIT_CONTRACT_ADDRESS'),
    );

    // console.log('approvedAmount', approvedAmount.toString());

    if (approvedAmount < ethers.parseEther(minApproval.toString())) {
      // console.log('Approving GameUSD token for deposit contract');
      const estimatedGas = await gameUsdTokenContract.approve.estimateGas(
        this.configService.get('DEPOSIT_CONTRACT_ADDRESS'),
        ethers.MaxUint256,
      );
      const txResponse = await gameUsdTokenContract.approve(
        this.configService.get('DEPOSIT_CONTRACT_ADDRESS'),
        ethers.MaxUint256,
        { gasLimit: estimatedGas + (estimatedGas * BigInt(30)) / BigInt(100) }, // increased by ~30% from actual gas used
      );
      await txResponse.wait();
    }

    // check native token balance for user wallet
    this.eventEmitter.emit(
      'gas.service.reload',
      from,
      Number(this.configService.get('BASE_CHAIN_ID')),
    );
  }
  private async withdrawGameUSD(from: string, amount: number, fee: number) {
    // const providerUrl = process.env.OPBNB_PROVIDER_RPC_URL;
    // const provider = new ethers.JsonRpcProvider(providerUrl);
    const provider = new ethers.JsonRpcProvider(
      this.configService.get(
        'PROVIDER_RPC_URL_' + this.configService.get('BASE_CHAIN_ID'),
      ),
    );
    const depositBot = new ethers.Wallet(
      await MPC.retrievePrivateKey(
        this.configService.get('DEPOSIT_BOT_ADDRESS'),
      ),
      provider,
    );
    const depositContractAddress = this.configService.get(
      'DEPOSIT_CONTRACT_ADDRESS',
    );
    const depositContract = Deposit__factory.connect(
      depositContractAddress,
      depositBot,
    );

    const gasUsed = await depositContract.withdraw.estimateGas(
      from,
      ethers.parseEther(amount.toString()),
      ethers.parseEther(fee.toString()),
    );
    const txResponse = await depositContract.withdraw(
      from,
      ethers.parseEther(amount.toString()),
      ethers.parseEther(fee.toString()),
      { gasLimit: gasUsed + (gasUsed * BigInt(30)) / BigInt(100) }, // increased by ~30% from actual gas used
    );
    const txReceipt = await txResponse.wait();

    // check native token balance for payout bot
    this.eventEmitter.emit(
      'gas.service.reload',
      depositBot.address,
      this.configService.get('BASE_CHAIN_ID'),
    );

    return txReceipt;
  }

  async getWithdrawalFees(chainId: number): Promise<number> {
    const setting = await this.settingRepository.findOneBy({
      key: `WITHDRAWAL_FEES_${chainId}`,
    });
    return Number(setting.value);
  }

  private async getUsdtBalance(chainId: number): Promise<bigint> {
    const providerUrl =
      chainId === 56 || chainId === 97
        ? this.configService.get('BNB_PROVIDER_RPC_URL')
        : this.configService.get('OPBNB_PROVIDER_RPC_URL');
    const tokenAddress =
      chainId === 56 || chainId === 97
        ? this.configService.get('BNB_USDT_TOKEN_ADDRESS')
        : this.configService.get('OPBNB_USDT_TOKEN_ADDRESS');
    const payoutPoolAddress =
      chainId === 56 || chainId === 97
        ? this.configService.get('BNB_PAYOUT_POOL_CONTRACT_ADDRESS')
        : this.configService.get('OPBNB_PAYOUT_POOL_CONTRACT_ADDRESS');

    const provider = new ethers.JsonRpcProvider(providerUrl);
    const usdtTokenContract = GameUSD__factory.connect(tokenAddress, provider);
    return await usdtTokenContract.balanceOf(payoutPoolAddress);
  }

  private async payoutUSDT(
    to: string,
    amount: number,
    chainId: number,
    signature: BytesLike,
  ): Promise<ethers.TransactionReceipt> {
    try {
      const providerUrl = this.configService.get(
        'PROVIDER_RPC_URL_' + chainId.toString(),
      );
      const provider = new ethers.JsonRpcProvider(providerUrl);
      const payoutBot = new ethers.Wallet(
        await MPC.retrievePrivateKey(
          this.configService.get('PAYOUT_BOT_ADDRESS'),
        ),
        provider,
      );

      const payoutPoolContractAddress =
        chainId === 56 || chainId === 97
          ? this.configService.get('BNB_PAYOUT_POOL_CONTRACT_ADDRESS')
          : this.configService.get('OPBNB_PAYOUT_POOL_CONTRACT_ADDRESS');

      const payoutPoolContract = Payout__factory.connect(
        payoutPoolContractAddress,
        payoutBot,
      );
      const txResponse = await payoutPoolContract.payout(
        ethers.parseEther(amount.toString()),
        to,
        signature,
      );
      const txReceipt = await txResponse.wait();

      // check native token balance for payout bot
      this.eventEmitter.emit('gas.service.reload', payoutBot.address, chainId);

      return txReceipt;
    } catch (error) {
      this.logger.error('payoutUSDT() error: ', error);
      return null;
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES, { utcOffset: 0 })
  async payoutCron() {
    const release = await this.payoutCronMutex.acquire();
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      const redeemTxs = await queryRunner.manager.find(RedeemTx, {
        where: {
          payoutSignature: Not(IsNull()),
          payoutTxHash: IsNull(),
          payoutStatus: TxStatus.PENDING,
          isPayoutTransferred: false,
          reviewedBy: Not(IsNull()),
        },
      });

      for (const tx of redeemTxs) {
        const jobId = `process_payout_${tx.id}`;
        await this.queueService.addJob(QueueName.WITHDRAW, jobId, {
          redeemTxId: tx.id,
          queueType: QueueType.PROCESS_PAYOUT,
        });
      }
    } catch (error) {
      this.logger.error('payoutCron() error: ', error);
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
      release();
    }
  }
}
