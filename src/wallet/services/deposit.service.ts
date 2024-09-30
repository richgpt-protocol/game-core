/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, QueryRunner, Repository } from 'typeorm';
import { ConfigService } from 'src/config/config.service';
import { DepositTx } from 'src/wallet/entities/deposit-tx.entity';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { DepositDTO } from '../dto/deposit.dto';
import { ethers, parseEther, parseUnits } from 'ethers';
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';
import { User } from 'src/user/entities/user.entity';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { PointService } from 'src/point/point.service';
import { UserService } from 'src/user/user.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MPC } from 'src/shared/mpc';
import { Setting } from 'src/setting/entities/setting.entity';
import { Deposit__factory } from 'src/contract';
import { QueueService } from 'src/queue/queue.service';
import { QueueName, QueueType } from 'src/shared/enum/queue.enum';
import { Job } from 'bullmq';
import { SettingEnum } from 'src/shared/enum/setting.enum';

/**
 * How deposit works
 * 1. deposit-bot access via api/v1/wallet/deposit
 * 2. processDeposit() create pending walletTx, depositTx and Adds it to queue of type `DEPOSIT_ESCROW`.
 * 3. handleEscrowTx() is executed by the queue, transfers the  deposited token to escrow wallet
 *    once success, set depositTx status to success and create pending gameUsdTx, otherwise retry again by the queue.
 * 4. handleGameUsdTx() transfer GameUSD to user wallet.
 *    once success, set gameUsdTx status to success and proceed to handleGameUSDTxHash()
 * 5. handleGameUSDTxHash() update walletTx status to success, update userWallet.walletBalance,
 *    create pointTx & update user userWallet.pointBalance, and proceed with handleReferralFlow()
 * 6. handleReferralFlow() create referral pointTx and update referral userWallet.pointBalance if user has referral.
 */

@Injectable()
export class DepositService implements OnModuleInit {
  private readonly logger = new Logger(DepositService.name);
  private readonly miniGameUSDTSender: string;

  constructor(
    @InjectRepository(UserWallet)
    private userWalletRepository: Repository<UserWallet>,
    private readonly configService: ConfigService,
    private adminNotificationService: AdminNotificationService,
    private dataSource: DataSource,
    private readonly pointService: PointService,
    private readonly userService: UserService,
    private eventEmitter: EventEmitter2,
    private queueservice: QueueService,
  ) {
    this.miniGameUSDTSender = this.configService.get('MINI_GAME_USDT_SENDER');
    if (!this.miniGameUSDTSender) {
      throw new Error('MINI_GAME_USDT_SENDER not found in .env');
    }
  }
  onModuleInit() {
    this.queueservice.registerHandler(
      QueueName.DEPOSIT,
      QueueType.DEPOSIT_ESCROW,
      {
        jobHandler: this.handleEscrowTx.bind(this),
        failureHandler: this.onEscrowTxFailed.bind(this),
      },
    );

    this.queueservice.registerHandler(
      QueueName.DEPOSIT,
      QueueType.DEPOSIT_GAMEUSD_ONCHAIN,
      {
        jobHandler: this.handleGameUsdTx.bind(this),
      },
    );

    this.queueservice.registerHandler(
      QueueName.DEPOSIT,
      QueueType.DEPOSIT_GAMEUSD_DB,
      {
        jobHandler: this.handleGameUSDTxHash.bind(this),
        failureHandler: this.onGameUsdTxFailed.bind(this),
      },
    );
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

  /** This method is Initiated by deposit bot.
   * This method will ignore the tx if the sender is mini-game's USDT sender.
   */
  async processDeposit(payload: DepositDTO) {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const userWallet = await queryRunner.manager.findOne(UserWallet, {
        where: {
          walletAddress: payload.walletAddress,
        },
      });
      if (
        payload.amount < 1 &&
        payload.depositerAddress.toLowerCase() !== this.miniGameUSDTSender
      ) {
        // deposit amount less than $1, inform admin and do nothing
        await this.adminNotificationService.setAdminNotification(
          `Error processing deposit for wallet: ${payload.walletAddress} \n
          Minimum Deposit Amount not met. \n
          UserId: ${userWallet.userId}. \n
          Deposit amount: ${payload.amount} \n
          TxHash: ${payload.txHash}`,
          'MINIMUM_DEPOSIT_AMOUNT',
          'Deposit Failed',
          false,
          true,
        );
        return;
      }

      const depositTx = await this._processDeposit(payload, queryRunner);

      await queryRunner.commitTransaction();

      await this.addToEscrowQueue(depositTx.id);
    } catch (error) {
      // queryRunner
      this.logger.error('processDeposit() error within queryRunner, error:', error);
      await queryRunner.rollbackTransaction();

      await this.adminNotificationService.setAdminNotification(
        `processDeposit() error within queryRunner, walletAddress: ${payload.walletAddress}, error: ${error}`,
        'TRANSACTION_ROLLBACK',
        'Transaction Rollback When Processing Deposit',
        false,
      );

      throw new InternalServerErrorException('Error processing deposit');
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  private async _processDeposit(
    payload: DepositDTO,
    queryRunner: QueryRunner,
    txType = 'DEPOSIT',
  ) {
    try {
      const userWallet = await queryRunner.manager.findOne(UserWallet, {
        where: {
          walletAddress: payload.walletAddress,
        },
      });
      if (!userWallet) return;

      const deposit_notify_threshold = await queryRunner.manager.findOne(
        Setting,
        {
          where: {
            key: SettingEnum.DEPOSIT_NOTIFY_THRESHOLD,
          },
        },
      );
      if (payload.amount >= Number(deposit_notify_threshold.value)) {
        // deposit amount more than deposit_notify_threshold, inform admin and proceed
        await this.adminNotificationService.setAdminNotification(
          `Deposit of ${payload.amount} ${payload.tokenAddress} received at ${payload.walletAddress}`,
          'DEPOSIT_THRESHOLD_NOTIFICATION',
          'Deposit Threshold Notification',
          false,
          true,
        );
      }

      // create walletTx with status pending
      const walletTx = new WalletTx();
      walletTx.txType = txType;
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

      // reload user wallet if needed
      if (payload.chainId !== Number(process.env.BASE_CHAIN_ID)) {
        // reload user wallet on deposit chain if needed
        this.eventEmitter.emit(
          'gas.service.reload',
          payload.walletAddress,
          payload.chainId,
        );
      }
      this.eventEmitter.emit(
        'gas.service.reload',
        payload.walletAddress,
        Number(process.env.BASE_CHAIN_ID),
      );

      return depositTx;
    } catch (error) {
      this.logger.error('processDeposit() error:', error);
      throw error;
    }
  }

  async addToEscrowQueue(depositTxId: number) {
    try {
      // add job to queue
      const jobId = `escrow-${depositTxId}`;
      await this.queueservice.addJob(QueueName.DEPOSIT, jobId, {
        depositTxId: depositTxId,
        queueType: QueueType.DEPOSIT_ESCROW,
      });
    } catch (error) {
      this.logger.error('addToEscrowQueue() error:', error);

      await this.adminNotificationService.setAdminNotification(
        `Error adding to escrow queue for depositTxId: ${depositTxId}`,
        'CRITICAL_ERROR',
        'Critical Error When Adding to Escrow Queue',
        false,
        true,
      );
      throw new InternalServerErrorException('Error adding to escrow queue');
    }
  }

  async retryDeposit(depositTxId: number) {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const depositTx = await queryRunner.manager
        .createQueryBuilder(DepositTx, 'depositTx')
        .leftJoinAndSelect('depositTx.walletTx', 'walletTx')
        .where('depositTx.id = :id', { id: depositTxId })
        .andWhere('walletTx.status != :status', { status: 'S' })
        .getOne();

      if (!depositTx) {
        throw new BadRequestException('Deposit not found or already processed');
      }

      const gameUsdTx = await queryRunner.manager.findOne(GameUsdTx, {
        where: {
          walletTxId: depositTx.walletTxId,
        },
      });

      if (gameUsdTx && gameUsdTx.status != 'S') {
        gameUsdTx.retryCount = 0;
        await queryRunner.manager.save(gameUsdTx);
      }

      await queryRunner.commitTransaction();

      // add job to queue
      const jobId = `escrow-${depositTx.id}`;
      await this.queueservice.addJob(QueueName.DEPOSIT, jobId, {
        depositTxId: depositTx.id,
        queueType: QueueType.DEPOSIT_ESCROW,
      });

      return true;
    } catch (error) {
      this.logger.error('retryDeposit() error:', error);
      await queryRunner.rollbackTransaction();

      if (error instanceof BadRequestException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Error retrying deposit');
      }
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  // Step1: transfer deposited token to escrow wallet
  async handleEscrowTx(job: Job<{ depositTxId: number }>) {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const depositTx = await queryRunner.manager
        .createQueryBuilder(DepositTx, 'depositTx')
        .innerJoinAndSelect('depositTx.walletTx', 'walletTx')
        .innerJoinAndSelect('walletTx.userWallet', 'userWallet')
        .where('depositTx.id = :id', { id: job.data.depositTxId })
        .orderBy('depositTx.id', 'ASC')
        .getOne();
      if (!depositTx) {
        await queryRunner.release();

        //add to next queue here
        return;
      }

      if (depositTx.isTransferred) {
        const gameUsdTx = await queryRunner.manager.findOne(GameUsdTx, {
          where: {
            walletTxId: depositTx.walletTxId,
          },
        });

        await queryRunner.release();

        //add to next queue here
        await this.queueservice.addJob(
          QueueName.DEPOSIT,
          `gameusd-${gameUsdTx.id}`,
          {
            gameUsdTxId: gameUsdTx.id,
            queueType: QueueType.DEPOSIT_GAMEUSD_ONCHAIN,
          },
          0,
          0,
        );

        return;
      }

      const userWallet = await queryRunner.manager.findOne(UserWallet, {
        where: {
          id: depositTx.walletTx.userWalletId,
        },
      });
      // if get private key failed, into catch block and retry again in next cron job
      const userSigner = await this.getSigner(
        userWallet.walletAddress,
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
        depositTx.walletTx.txAmount.toString(),
        await tokenContract.decimals(),
      );

      // transfer user deposit token to escrow wallet
      const onchainEscrowTx = await this.transferToken(
        tokenContract,
        escrowAddress,
        depositAmount,
      );
      // if transfer token failed, normally due to insufficient gas fee, means
      // user wallet haven't been reloaded yet in processDeposit() especially new created wallet
      // into catch block and retry again in next cron job
      const receipt = await onchainEscrowTx.wait(1);
      const onchainEscrowTxHash = onchainEscrowTx.hash;

      // reload user wallet that execute token transfer if needed
      this.eventEmitter.emit(
        'gas.service.reload',
        userWallet.walletAddress,
        depositTx.chainId,
      );

      if (receipt && receipt.status == 1) {
        // transfer token transaction success
        depositTx.isTransferred = true;
        depositTx.status = 'S';
        depositTx.txHash = onchainEscrowTxHash;
        await queryRunner.manager.save(depositTx);

        const gameUsdTx = new GameUsdTx();
        gameUsdTx.amount = depositTx.walletTx.txAmount;
        gameUsdTx.chainId = +this.configService.get('BASE_CHAIN_ID');
        gameUsdTx.status = 'P';
        gameUsdTx.senderAddress = this.configService.get(
          'GAMEUSD_POOL_CONTRACT_ADDRESS',
        );
        gameUsdTx.receiverAddress = userWallet.walletAddress;
        gameUsdTx.walletTxId = depositTx.walletTx.id;
        gameUsdTx.walletTxs = [depositTx.walletTx];
        await queryRunner.manager.save(gameUsdTx);

        await this.queueservice.addJob(
          QueueName.DEPOSIT,
          `gameusd-${gameUsdTx.id}`,
          {
            gameUsdTxId: gameUsdTx.id,
            queueType: QueueType.DEPOSIT_GAMEUSD_ONCHAIN,
          },
          0,
          0,
        );
      } else if (receipt && receipt.status != 1) {
        throw new Error(
          `Escrow transaction failed with hash: ${onchainEscrowTxHash}`,
        );
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      this.logger.error('handleEscrowTx() error:', error);
      throw new Error(`Error processing deposit ${error}`);
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  private async onEscrowTxFailed(
    job: Job<{ depositTxId: number }>,
    error: Error,
  ) {
    if (job.attemptsMade > job.opts.attempts) {
      const queryRunner = this.dataSource.createQueryRunner();

      try {
        await queryRunner.connect();
        await queryRunner.startTransaction();

        const depositTx = await queryRunner.manager
          .createQueryBuilder(DepositTx, 'depositTx')
          .innerJoinAndSelect('depositTx.walletTx', 'walletTx')
          .where('depositTx.id = :id', { id: job.data.depositTxId })
          .orderBy('depositTx.id', 'ASC')
          .getOne();
        if (!depositTx) {
          await queryRunner.release();
          return;
        }

        depositTx.status = 'F';
        depositTx.walletTx.status = 'F';
        await queryRunner.manager.save(depositTx);
        await queryRunner.manager.save(depositTx.walletTx);

        await queryRunner.commitTransaction();
        await queryRunner.release();
        await this.adminNotificationService.setAdminNotification(
          `Transaction to escrow failed depositTx.id: ${depositTx.id} with error: ${error}`,
          'ESCROW_FAILED',
          'Transfer to Escrow Failed',
          false,
          false,
          depositTx.walletTxId,
        );
      } catch (error) {
        if (!queryRunner.isReleased) await queryRunner.release();
        this.logger.error('Error in onEscrowTxFailed', error);
      }
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

  // Step2: transfer GameUSD to user wallet.
  // When calling addJob(), set attempts to 0 as this function itself will handle retry
  private async handleGameUsdTx(job: Job<{ gameUsdTxId: number }>) {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const gameUsdTx = await queryRunner.manager
        .createQueryBuilder(GameUsdTx, 'gameUsdTx')
        .where('gameUsdTx.id = :id', { id: job.data.gameUsdTxId })
        .getOne();

      if (!gameUsdTx) {
        await queryRunner.release();
        return;
      }

      if (gameUsdTx.status == 'S') {
        await queryRunner.release();

        const jobId = `updateStatus-${gameUsdTx.id}`;
        await this.queueservice.addJob(QueueName.DEPOSIT, jobId, {
          gameUsdTxId: gameUsdTx.id,
          queueType: QueueType.DEPOSIT_GAMEUSD_DB,
        });

        return;
      }

      try {
        while (gameUsdTx.retryCount < 5) {
          try {
            // if get private key failed, into catch block and retry again in next cron job
            const depositAdminWallet = await this.getSigner(
              this.configService.get('DEPOSIT_BOT_ADDRESS'),
              gameUsdTx.chainId,
            );
            // throw new Error('Test Error');

            // if transfer GameUSD failed due to gas limit, into catch block and retry again in next cron job
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
              // transfer GameUSD transaction success
              gameUsdTx.status = 'S';
              break;
            } else {
              // transfer GameUSD transaction failed, try again later
              gameUsdTx.retryCount += 1;
            }
          } catch (error) {
            // two possible reach here
            // 1. get private key failed due to share threshold not met
            // 2. transfer GameUSD failed due to gas limit
            this.logger.error('handleGameUsdTx() error:', error);
            gameUsdTx.retryCount += 1;
          } finally {
            await queryRunner.manager.save(gameUsdTx);
          }
        }

        if (gameUsdTx.retryCount >= 5) {
          // set gameUsdTx status to failed
          gameUsdTx.status = 'F';
          await queryRunner.manager.save(gameUsdTx);
          // set walletTx status to failed
          await queryRunner.manager.update(
            WalletTx,
            { id: gameUsdTx.walletTxId },
            { status: 'F' },
          );

          await queryRunner.commitTransaction();
          if (!queryRunner.isReleased) await queryRunner.release();

          await this.adminNotificationService.setAdminNotification(
            `GameUSD transaction after 5 times for gameUsdTx id: ${gameUsdTx.id}`,
            'GAMEUSD_TX_FAILED_5_TIMES',
            'GameUSD transfer failed',
            true,
            true,
            gameUsdTx.walletTxId,
          );
        }

        if (gameUsdTx.status == 'S') {
          // handles the db part of gameUsdTx sent to user address.
          await queryRunner.commitTransaction();
          if (!queryRunner.isReleased) await queryRunner.release();

          const jobId = `updateStatus-${gameUsdTx.id}`;
          await this.queueservice.addJob(QueueName.DEPOSIT, jobId, {
            gameUsdTxId: gameUsdTx.id,
            queueType: QueueType.DEPOSIT_GAMEUSD_DB,
          });
        }
      } catch (error) {
        // queryRunner
        this.logger.error('handleGameUsdTx() error:', error);
        // no queryRunner.rollbackTransaction() here because contain on-chain data
        // no new record created as well so nothing to rollback

        // set status to failed
        gameUsdTx.status = 'F';
        await queryRunner.manager.save(gameUsdTx);

        await queryRunner.commitTransaction();
        if (!queryRunner.isReleased) await queryRunner.release();

        // inform admin
        await this.adminNotificationService.setAdminNotification(
          `handleGameUsdTx() error within queryRunner - GameUsdTx id: ${gameUsdTx.id}, error: ${error}`,
          'CRITICAL_ERROR',
          'Critical Error When Transfer GameUSD',
          false,
          false,
          gameUsdTx.walletTxId,
        );
      }
    } catch (error) {
      this.logger.error('handleGameUsdTx() error:', error);
      if (!queryRunner.isReleased) await queryRunner.release();

      await this.adminNotificationService.setAdminNotification(
        `handleGameUsdTx() error, error: ${error}`,
        'CRITICAL_ERROR',
        'Critical Error When Transfer GameUSD',
        true,
        true,
      );
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
  private async handleGameUSDTxHash(job: Job<{ gameUsdTxId: number }>) {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const gameUsdTx = await queryRunner.manager.findOne(GameUsdTx, {
        where: {
          id: job.data.gameUsdTxId,
        },
      });
      const walletTx = await queryRunner.manager
        .createQueryBuilder(WalletTx, 'walletTx')
        .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
        .leftJoinAndSelect('userWallet.user', 'user')
        .where('walletTx.id = :id', { id: gameUsdTx.walletTxId })
        .getOne();

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
      walletTx.userWallet.walletBalance = walletTx.endingBalance;

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
      pointTx.txType = walletTx.txType; //'DEPOSIT';
      pointTx.amount = pointTxAmount;
      pointTx.startingBalance = pointTxStartingBalance;
      pointTx.endingBalance = pointTxEndingBalance;
      pointTx.walletId = walletTx.userWallet.id;
      pointTx.userWallet = walletTx.userWallet;
      pointTx.walletTxId = walletTx.id;
      pointTx.walletTx = walletTx;
      await queryRunner.manager.save(pointTx);

      // update userWallet pointBalance
      walletTx.userWallet.pointBalance = pointTxEndingBalance;
      await queryRunner.manager.save(walletTx.userWallet);

      await this.handleReferralFlow(
        walletTx.userWallet.id,
        walletTx.txAmount,
        queryRunner,
      );

      await queryRunner.commitTransaction();
      if (!queryRunner.isReleased) await queryRunner.release();

      await this.userService.setUserNotification(walletTx.userWallet.userId, {
        type: 'Deposit',
        title: 'Deposit Processed Successfully',
        message: 'Your Deposit has been successfully processed',
        walletTxId: walletTx.id,
      });
    } catch (error) {
      this.logger.error(
        'handleGameUsdTxHash() error within queryRunner, error:',
        error,
      );
      await queryRunner.rollbackTransaction();

      throw new Error(`Error processing gameUsdTx ${error}`); //throwing to retry
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  private async onGameUsdTxFailed(
    job: Job<{ gameUsdTxId: number }>,
    error: Error,
  ) {
    if (job.attemptsMade >= job.opts.attempts) {
      const queryRunner = this.dataSource.createQueryRunner();
      try {
        await queryRunner.connect();
        await queryRunner.startTransaction();

        const gameUsdTx = await queryRunner.manager
          .createQueryBuilder(GameUsdTx, 'gameUsdTx')
          .leftJoinAndSelect('gameUsdTx.walletTxs', 'walletTxs')
          .where('gameUsdTx.id = :id', { id: job.data.gameUsdTxId })
          .getOne();

        gameUsdTx.walletTxs[0].status = 'F';
        await queryRunner.manager.save(gameUsdTx.walletTxs[0]);

        await queryRunner.commitTransaction();
        await queryRunner.release();

        await this.adminNotificationService.setAdminNotification(
          `GameUSD transaction failed after ${job.attemptsMade} times for gameUsdTx id: ${gameUsdTx.id} with error: ${error}`,
          'GAMEUSD_TX_FAILED_5_TIMES',
          'GameUSD transfer failed',
          false,
          false,
          gameUsdTx.walletTxId,
        );
      } catch (error) {
        this.logger.error('Error in onGameUsdTxFailed', error);
      }
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
    queryRunner: QueryRunner,
  ) {
    try {
      const userInfo = await queryRunner.manager
        .createQueryBuilder(User, 'user')
        .leftJoinAndSelect('user.referralUser', 'referralUser')
        .leftJoinAndSelect('referralUser.wallet', 'wallet')
        .where('user.id = :id', { id: userId })
        .getOne();

      if (!userInfo || userInfo.referralUserId == null) {
        // do nothing, queryRunner.release() will be done in parent function
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
    } catch (error) {
      // queryRunner
      this.logger.error(
        'handleReferralFlow() error within queryRunner, error:',
        error,
      );

      throw new Error(`Error processing referral flow ${error}`);
    }
  }
}
