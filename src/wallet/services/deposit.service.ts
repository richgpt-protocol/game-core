/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { ConfigService } from 'src/config/config.service';
import { DepositTx } from 'src/wallet/entities/deposit-tx.entity';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { DepositDTO } from '../dto/deposit.dto';
import { ethers, parseEther, parseUnits } from 'ethers';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';
import { User } from 'src/user/entities/user.entity';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { PointService } from 'src/point/point.service';
import { UserService } from 'src/user/user.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MPC } from 'src/shared/mpc';
import { Mutex } from 'async-mutex';
import { Setting } from 'src/setting/entities/setting.entity';
import { Deposit__factory } from 'src/contract';
import { QueueService } from 'src/queue/queue.service';
import { Job } from 'bullmq';
import { GasService } from 'src/shared/services/gas.service';
import { ReloadTx } from '../entities/reload-tx.entity';

/**
 * How deposit works
 * 1. deposit-bot access via api/v1/wallet/deposit
 * TODO: add more details
 */

type DepositJob = {
  walletTx: WalletTx;
  depositTx?: DepositTx;
  reloadTx?: ReloadTx;
  gameUsdTx?: GameUsdTx;
  queueType: string;
};

@Injectable()
export class DepositService implements OnModuleInit {
  private readonly cronMutex: Mutex = new Mutex();

  constructor(
    @InjectRepository(DepositTx)
    private depositRepository: Repository<DepositTx>,
    @InjectRepository(UserWallet)
    private userWalletRepository: Repository<UserWallet>,
    private readonly configService: ConfigService,
    private adminNotificationService: AdminNotificationService,
    private dataSource: DataSource,
    private readonly pointService: PointService,
    private readonly userService: UserService,
    private eventEmitter: EventEmitter2,
    private readonly queueService: QueueService,
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
    private readonly gasService: GasService,
  ) {}

  onModuleInit() {
    this.queueService.registerHandler('DEPOSIT_QUEUE', 'RELOAD_NATIVE', {
      jobHandler: this.reloadNative.bind(this),
      failureHandler: this.reloadNativeFailed.bind(this),
    });

    this.queueService.registerHandler('DEPOSIT_QUEUE', 'HANDLE_ESCROW_TX', {
      jobHandler: this.handleEscrowTx.bind(this),
      failureHandler: this.handleEscrowTxFailed.bind(this),
    });

    this.queueService.registerHandler('DEPOSIT_QUEUE', 'HANDLE_GAME_USD_TX', {
      jobHandler: this.handleGameUsdTx.bind(this),
      failureHandler: this.handleGameUsdTxFailed.bind(this),
    });

    this.queueService.registerHandler('DEPOSIT_QUEUE', 'UPDATE_RECORD', {
      jobHandler: this.updateRecord.bind(this),
      failureHandler: this.updateRecordFailed.bind(this),
    });
  }

  async getAllAddress(page: number = 1, limit: number = 100) {
    const wallets = await this.userWalletRepository
      .createQueryBuilder('userWallet')
      .select('userWallet.walletAddress')
      .take(limit)
      .skip((page - 1) * limit)
      .getManyAndCount();

    const walletAddresses = wallets[0].map((wallet) => wallet.walletAddress);

    return {
      addresses: walletAddresses,
      total: wallets[1],
      currentPage: page,
      totalPages: Math.ceil(wallets[1] / limit),
    };
  }

  async processDeposit(payload: DepositDTO) {
    const deposit_notify_threshold = await this.settingRepository.findOne({
      where: {
        key: 'DEPOSIT_NOTIFY_THRESHOLD',
      },
    });
    if (payload.amount >= Number(deposit_notify_threshold.value)) {
      // deposit amount more than deposit_notify_threshold, inform admin and continue proceed with deposit
      await this.adminNotificationService.setAdminNotification(
        `Deposit of ${payload.amount} ${payload.tokenAddress} received at ${payload.walletAddress}`,
        'DEPOSIT_THRESHOLD_NOTIFICATION',
        'Deposit Threshold Notification',
        false,
        true,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const userWallet = await queryRunner.manager.findOne(UserWallet, {
        where: {
          walletAddress: payload.walletAddress,
        },
      });
      // userWallet should not null because deposit bot only trigger this function
      // if the account(walletAddress) is valid(created by us)
      if (!userWallet) return;

      // create walletTx with status pending
      const walletTx = new WalletTx();
      walletTx.txType = 'DEPOSIT';
      walletTx.txAmount = payload.amount;
      walletTx.txHash = payload.txHash;
      walletTx.status = 'P';
      walletTx.userWalletId = userWallet.id;
      walletTx.userWallet = userWallet;
      const walletTxResult = await queryRunner.manager.save(walletTx);

      // create depositTx with status pending
      const depositTx = new DepositTx();
      depositTx.currency = payload.tokenAddress;
      depositTx.senderAddress = payload.depositerAddress;
      depositTx.receiverAddress = payload.walletAddress;
      depositTx.chainId = payload.chainId;
      depositTx.isTransferred = false;
      depositTx.status = 'P';
      depositTx.walletTxId = walletTxResult.id;
      depositTx.walletTx = walletTx;
      await queryRunner.manager.save(depositTx);

      const provider_rpc_url = this.configService.get(
        `PROVIDER_RPC_URL_${payload.chainId.toString()}`,
      );
      const provider = new ethers.JsonRpcProvider(provider_rpc_url);
      const balance = await provider.getBalance(payload.walletAddress);
      if (balance < ethers.parseEther('0.001')) {
        const reloadTx = new ReloadTx();
        reloadTx.amount = 0.001;
        reloadTx.status = 'P';
        reloadTx.chainId = payload.chainId;
        reloadTx.currency = 'BNB';
        reloadTx.amountInUSD = await this.gasService.getAmountInUSD('0.001');
        reloadTx.txHash = null;
        reloadTx.retryCount = 0;
        reloadTx.userWallet = userWallet;
        reloadTx.userWalletId = userWallet.id;
        await queryRunner.manager.save(reloadTx);

        const jobId = `reloadNative-${reloadTx.id}`;
        const data: DepositJob = {
          walletTx: walletTx,
          depositTx: depositTx,
          reloadTx: reloadTx,
          queueType: 'RELOAD_NATIVE',
        };
        await this.queueService.addJob(
          'DEPOSIT_QUEUE',
          jobId,
          data,
          500, // no delay
        );
      } else {
        const jobId = `handleEscrowTx-${depositTx.id}`;
        const data: DepositJob = {
          walletTx: walletTx,
          depositTx: depositTx,
          queueType: 'HANDLE_ESCROW_TX',
        };
        await this.queueService.addJob(
          'DEPOSIT_QUEUE',
          jobId,
          data,
          500, // no delay
        );
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      // queryRunner
      console.error('processDeposit() error within queryRunner, error:', error);
      await queryRunner.rollbackTransaction();

      await this.adminNotificationService.setAdminNotification(
        `processDeposit() error within queryRunner, walletAddress: ${payload.walletAddress}, error: ${error}`,
        'TRANSACTION_ROLLBACK',
        'Transaction Rollback When Processing Deposit',
        false,
      );

      // No retry for this function. If failed, need to manually call the endpoint from whitelisted IP.
      throw new InternalServerErrorException('Error processing deposit');
    } finally {
      await queryRunner.release();
    }
  }

  // reload native token for gas if needed
  async reloadNative(job: Job<DepositJob>): Promise<void> {
    const walletTx = job.data.walletTx;
    const depositTx = job.data.depositTx;
    const reloadTx = job.data.reloadTx;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const txReceipt = await this.gasService.reloadNative(
        depositTx.receiverAddress,
        depositTx.chainId,
      );
      reloadTx.txHash = txReceipt.hash;
      if (txReceipt.status === 1) {
        // must be no error in this block else on-chain tx will submit again
        reloadTx.status = 'S';
        await queryRunner.manager.save(reloadTx);
        await queryRunner.commitTransaction();

        const jobId = `handleEscrowTx-${depositTx.id}`;
        const data: DepositJob = {
          walletTx: walletTx,
          depositTx: depositTx,
          queueType: 'HANDLE_ESCROW_TX',
        };
        await this.queueService.addJob(
          'DEPOSIT_QUEUE',
          jobId,
          data,
          500, // no delay
        );
      
      } else {
        throw new Error('reloadNative on-chain tx failed')
      }
    } catch (error) {
      throw new Error('reloadNative job failed, error: ' + error);
    } finally {
      await queryRunner.release();
    }
  }

  async reloadNativeFailed(job: Job<DepositJob>, error: Error) {
    console.error('reloadNative job error:', error)

    const reloadTx = job.data.reloadTx;
    console.error(reloadTx)

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      if (job.attemptsMade >= job.opts.attempts) {
        reloadTx.status = 'F';
        await queryRunner.manager.save(reloadTx);
        const walletTx = job.data.walletTx;
        walletTx.status = 'F';
        await queryRunner.manager.save(walletTx);
        const depositTx = job.data.depositTx;
        depositTx.status = 'F';
        await queryRunner.manager.save(depositTx);
        await queryRunner.commitTransaction();

        await this.adminNotificationService.setAdminNotification(
          `Reload native failed after 5 times for deposit service, reloadTx.id: ${reloadTx.id}`,
          'RELOAD_NATIVE_FAILED',
          'Reload Native Failed in Deposit Service',
          true,
          true,
          walletTx.id,
        );
      } else {
        reloadTx.retryCount += 1;
        await queryRunner.manager.save(reloadTx);
        await queryRunner.commitTransaction();
      }
    } catch (error) {
      console.error('reloadNativeFailed() error:', error);
    } finally {
      await queryRunner.release();
    }
  }

  // transfer deposited token(i.e. USDT) to escrow wallet
  async handleEscrowTx(job: Job<DepositJob>): Promise<void> {
    const walletTx = job.data.walletTx;
    const depositTx = job.data.depositTx;
    const userWalletAddress = depositTx.receiverAddress;

    const userSigner = await this.getSigner(
      userWalletAddress,
      depositTx.chainId,
    );
    const tokenContract = await this.getTokenContract(
      depositTx.currency,
      userSigner,
    );
    const escrowAddress = this.configService.get(
      `ESCROW_ADDRESS_${depositTx.chainId.toString()}`,
    );
    const depositAmount = parseUnits(
      walletTx.txAmount.toString(),
      await tokenContract.decimals(),
    );
    const onchainEscrowTx = await this.transferToken(
      tokenContract,
      escrowAddress,
      depositAmount,
    );
    const receipt = await onchainEscrowTx.wait();
    const onchainEscrowTxHash = onchainEscrowTx.hash;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      depositTx.txHash = onchainEscrowTxHash; // regardless of success or fail
      await queryRunner.manager.save(depositTx);

      if (receipt && receipt.status == 1) {
        // transfer token transaction success
        // cannot throw error in this block else on-chain tx will submit again via queue job
        depositTx.isTransferred = true;
        depositTx.status = 'S';
        await queryRunner.manager.save(depositTx);

        const gameUsdTx = new GameUsdTx();
        gameUsdTx.amount = walletTx.txAmount;
        gameUsdTx.chainId = +this.configService.get('BASE_CHAIN_ID');
        gameUsdTx.status = 'P';
        gameUsdTx.senderAddress = this.configService.get(
          'GAMEUSD_POOL_CONTRACT_ADDRESS',
        );
        gameUsdTx.receiverAddress = userWalletAddress;
        gameUsdTx.walletTxId = walletTx.id;
        gameUsdTx.walletTxs = [walletTx];
        await queryRunner.manager.save(gameUsdTx);
        await queryRunner.commitTransaction();

        const jobId = `handleGameUsdTx-${gameUsdTx.id}`;
        const data: DepositJob = {
          walletTx: walletTx,
          gameUsdTx: gameUsdTx,
          queueType: 'HANDLE_GAME_USD_TX',
        };
        await this.queueService.addJob(
          'DEPOSIT_QUEUE',
          jobId,
          data,
          500, // no delay
        );
      } else if (receipt && receipt.status != 1) {
        // transfer token transaction failed
        // this error will capture by queue job and retry again later
        throw new Error('transferToken on-chain tx failed');
      }
    } finally {
      await queryRunner.release();
    }
  }

  async handleEscrowTxFailed(job: Job<DepositJob>, error: Error): Promise<void> {
    console.error('handleEscrowTx job error:', error);

    const depositTx = job.data.depositTx;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      if (job.attemptsMade >= job.opts.attempts) {
        depositTx.status = 'F';
        await queryRunner.manager.save(depositTx);
        const walletTx = job.data.walletTx;
        walletTx.status = 'F';
        await queryRunner.manager.save(walletTx);
        await queryRunner.commitTransaction();

        await this.adminNotificationService.setAdminNotification(
          `Handle escrow tx failed after 5 times for deposit service, depositTx.id: ${depositTx.id}`,
          'HANELD_ESCROW_TX_FAILED',
          'Handle Escrow Tx Failed in Deposit Service',
          true,
          true,
          walletTx.id,
        );
      } else {
        depositTx.retryCount += 1;
        await queryRunner.manager.save(depositTx);
        await queryRunner.commitTransaction();
      }
    } catch (error) {
      console.error('handleEscrowTxFailed() error:', error);
    } finally {
      await queryRunner.release();
    }
  }

  private async getSigner(
    walletAddress: string,
    chainId: number,
  ): Promise<ethers.Wallet> {
    const providerUrl = this.configService.get(`PROVIDER_RPC_URL_${chainId}`);
    const provider = new ethers.JsonRpcProvider(providerUrl);
    return new ethers.Wallet(
      await MPC.retrievePrivateKey(walletAddress),
      provider,
    );
  }

  private async getTokenContract(tokenAddress: string, signer: ethers.Wallet) {
    return new ethers.Contract(
      tokenAddress,
      [
        `function transfer(address,uint256) external`,
        `function balanceOf(address) external view returns (uint256)`,
        `function decimals() external view returns (uint8)`,
        `function approve(address spender, uint256 amount) external returns (bool)`,

        `function allowance(address owner, address spender) external view returns (uint256)`,
      ],
      signer,
    );
  }

  private async transferToken(
    tokenContract: ethers.Contract,
    to: string,
    amount: bigint,
  ) {
    const gasLimit = await tokenContract.transfer.estimateGas(to, amount);
    return await tokenContract.transfer(to, amount, {
      gasLimit: gasLimit + (gasLimit * BigInt(30)) / BigInt(100),
    });
  }

  // transfer GameUSD to user wallet
  async handleGameUsdTx(job: Job<DepositJob>): Promise<void> {
    const walletTx = job.data.walletTx;
    const gameUsdTx = job.data.gameUsdTx;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
        const depositAdminWallet = await this.getSigner(
          this.configService.get('DEPOSIT_BOT_ADDRESS'),
          gameUsdTx.chainId,
        );

        const onchainGameUsdTx = await this.depositGameUSD(
          gameUsdTx.receiverAddress,
          parseEther(gameUsdTx.amount.toString()),
          depositAdminWallet,
        );

        // reload deposit admin wallet if needed
        this.eventEmitter.emit(
          'gas.service.reload',
          await depositAdminWallet.getAddress(),
          gameUsdTx.chainId,
        );

        // save txHash for transfer GameUSD
        gameUsdTx.txHash = onchainGameUsdTx.hash;

        // check on-chain tx status
        const txReceipt = await onchainGameUsdTx.wait(1);
        if (txReceipt && txReceipt.status == 1) {
          gameUsdTx.status = 'S';
          await queryRunner.manager.save(gameUsdTx);
          await queryRunner.commitTransaction();

          const jobId = `updateRecord-${walletTx.id}`;
          const data: DepositJob = {
            walletTx: walletTx,
            queueType: 'UPDATE_RECORD',
          };
          await this.queueService.addJob(
            'DEPOSIT_QUEUE',
            jobId,
            data,
            500, // no delay
          );
        } else {
          throw new Error('transfer GameUSD on-chain tx failed');
        }
      } catch (error) {
        console.error('handleGameUsdTx() error:', error);
      } finally {
        await queryRunner.release();
      }
    }

  async handleGameUsdTxFailed(job: Job<DepositJob>, error: Error): Promise<void> {
    console.error('handleGameUsdTx job error:', error);

    const gameUsdTx = job.data.gameUsdTx;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      if (job.attemptsMade >= job.opts.attempts) {
        gameUsdTx.status = 'F';
        await queryRunner.manager.save(gameUsdTx);
        const walletTx = job.data.walletTx;
        walletTx.status = 'F';
        await queryRunner.manager.save(walletTx);
        await queryRunner.commitTransaction();

        await this.adminNotificationService.setAdminNotification(
          `Handle GameUsd tx failed after 5 times for deposit service, gameUsdTx.id: ${gameUsdTx.id}`,
          'HANELD_GAME_USD_TX_FAILED',
          'Handle Game Usd Tx Failed in Deposit Service',
          true,
          true,
          walletTx.id,
        );
      } else {
        gameUsdTx.retryCount += 1;
        await queryRunner.manager.save(gameUsdTx);
        await queryRunner.commitTransaction();
      }
    } catch (error) {
      console.error('handleGameUsdTxFailed() error:', error);
    } finally {
      await queryRunner.release();
    }
  }

  private async depositGameUSD(
    to: string,
    amount: bigint,
    signer: ethers.Wallet,
  ) {
    const depositContract = Deposit__factory.connect(
      this.configService.get('DEPOSIT_CONTRACT_ADDRESS'),
      signer,
    );
    const gasLimit = await depositContract.deposit.estimateGas(to, amount);
    return await depositContract.deposit(to, amount, {
      gasLimit: gasLimit + (gasLimit * BigInt(30)) / BigInt(100),
    });
  }

  // handles the db part of gameUsdTx sent to user address.
  private async updateRecord(job: Job<DepositJob>): Promise<void> {
    const walletTx = job.data.walletTx;
    const gameUsdTx = job.data.gameUsdTx;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // update walletTx
      const previousWalletTx = await this.lastValidWalletTx(
        walletTx.userWalletId,
      );
      walletTx.status = 'S';
      walletTx.startingBalance = previousWalletTx?.endingBalance || 0;
      walletTx.endingBalance =
        (Number(previousWalletTx?.endingBalance) || 0) +
        Number(gameUsdTx.amount);
      await queryRunner.manager.save(walletTx);

      // update userWallet walletBalance
      const userWallet = await queryRunner.manager
        .createQueryBuilder(UserWallet, 'userWallet')
        .where('userWallet.id = :id', { id: walletTx.userWalletId })
        .getOne();
      userWallet.walletBalance = walletTx.endingBalance;
      await queryRunner.manager.save(userWallet);

      // create user pointTx
      const pointInfo = this.pointService.getDepositPoints(
        Number(walletTx.txAmount),
      );
      const lastValidPointTx = await this.lastValidPointTx(
        walletTx.userWallet.id,
      );
      const pointTxAmount =
        pointInfo.xp + (walletTx.txAmount * pointInfo.bonusPerc) / 100;
      const pointTxStartingBalance = lastValidPointTx?.endingBalance || 0;
      const pointTxEndingBalance =
        Number(pointTxStartingBalance) + Number(pointTxAmount);
      const pointTx = new PointTx();
      pointTx.txType = 'DEPOSIT';
      pointTx.amount = pointTxAmount;
      pointTx.startingBalance = pointTxStartingBalance;
      pointTx.endingBalance = pointTxEndingBalance;
      pointTx.walletId = userWallet.id;
      pointTx.userWallet = walletTx.userWallet;
      pointTx.walletTxId = walletTx.id;
      pointTx.walletTx = walletTx;
      await queryRunner.manager.save(pointTx);

      // update userWallet pointBalance
      userWallet.pointBalance = pointTxEndingBalance;
      await queryRunner.manager.save(userWallet);

      await queryRunner.commitTransaction();

      await this.userService.setUserNotification(walletTx.userWallet.userId, {
        type: 'Deposit',
        title: 'Deposit Processed Successfully',
        message: 'Your Deposit has been successfully processed',
        walletTxId: walletTx.id,
      });

      await this.handleReferralFlow(
        walletTx.userWallet.id,
        walletTx.txAmount,
        gameUsdTx.id,
        gameUsdTx.txHash,
        queryRunner,
      );
    } catch (error) {
      console.error(
        'handleGameUsdTxHash() error within queryRunner, error:',
        error,
      );
      await queryRunner.rollbackTransaction();
      throw new Error('Error updating record:' + error);
    } finally {
      await queryRunner.release();
    }
  }

  async updateRecordFailed(job: Job<DepositJob>, error: Error): Promise<void> {
    console.error('updateReload job error:', error);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      if (job.attemptsMade >= job.opts.attempts) {
        const walletTx = job.data.walletTx;
        walletTx.status = 'F';
        await queryRunner.manager.save(walletTx);
        await queryRunner.commitTransaction();

        await this.adminNotificationService.setAdminNotification(
          `Update record failed after 5 times for deposit service, walletTx.id: ${walletTx.id}`,
          'UPDATE_RECORD_FAILED',
          'Update Record Failed in Deposit Service',
          true,
          true,
          walletTx.id,
        );
      }
    } catch (error) {
      console.error('updateReloadFailed() error:', error);
    } finally {
      await queryRunner.release();
    }
  }

  private async lastValidWalletTx(userWalletId: number) {
    return await this.dataSource.manager.findOne(WalletTx, {
      where: {
        userWalletId,
        status: 'S',
      },
      order: {
        createdDate: 'DESC',
      },
    });
  }

  private async lastValidPointTx(walletId: number) {
    return await this.dataSource.manager.findOne(PointTx, {
      where: {
        walletId,
      },
      order: {
        createdDate: 'DESC',
      },
    });
  }

  private async handleReferralFlow(
    userId: number,
    depositAmount: number,
    gameUsdTxId: number,
    depositGameUsdTxHash: string,
    queryRunner: QueryRunner,
  ) {
    await queryRunner.startTransaction();

    try {
      const userInfo = await queryRunner.manager
        .createQueryBuilder(User, 'user')
        .leftJoinAndSelect('user.referralUser', 'referralUser')
        .leftJoinAndSelect('referralUser.wallet', 'wallet')
        .where('user.id = :id', { id: userId })
        .getOne();

      if (!userInfo || userInfo.referralUserId == null) {
        // do nothing, queryRunner.release() will be done in parent function
        await queryRunner.commitTransaction();
        return;
      }

      // create pointTx
      const referrerXp = this.pointService.getReferralDepositXp(
        Number(depositAmount),
      );
      const lastValidPointTx = await queryRunner.manager.findOne(PointTx, {
        where: {
          walletId: userInfo.referralUser.wallet.id,
        },
        order: {
          createdDate: 'DESC',
        },
      });
      const pointTx = new PointTx();
      pointTx.txType = 'REFERRAL';
      pointTx.amount = referrerXp;
      pointTx.startingBalance = lastValidPointTx?.endingBalance || 0;
      pointTx.endingBalance =
        Number(pointTx.startingBalance) + Number(pointTx.amount);
      pointTx.walletId = userInfo.referralUser.wallet.id;
      pointTx.userWallet = userInfo.referralUser.wallet;
      await queryRunner.manager.save(pointTx);

      // update userWallet pointBalance
      userInfo.referralUser.wallet.pointBalance = pointTx.endingBalance;
      await queryRunner.manager.save(userInfo.referralUser.wallet);

      await queryRunner.commitTransaction();
    } catch (error) {
      // queryRunner
      console.error(
        'handleReferralFlow() error within queryRunner, error:',
        error,
      );
      await queryRunner.rollbackTransaction();

      // inform admin
      this.adminNotificationService.setAdminNotification(
        `handleReferralFlow() error within queryRunner, gameUsdTx id: ${gameUsdTxId}, error: ${error}`,
        'TRANSACTION_ROLLBACK',
        'Transaction Rollback When Create Referral PointTx',
        true,
        true,
      );
    } finally {
      // do nothing, queryRunner.release() will be done in parent function
    }
  }
}
