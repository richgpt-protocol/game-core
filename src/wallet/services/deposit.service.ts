/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { ConfigService } from 'src/config/config.service';
import { DepositTx } from 'src/wallet/entities/deposit-tx.entity';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { DepositDTO, ReviewDepositDto } from '../dto/deposit.dto';
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
import { Deposit__factory, ERC20, ERC20__factory } from 'src/contract';
import { QueueService } from 'src/queue/queue.service';
import { QueueName, QueueType } from 'src/shared/enum/queue.enum';
import { Job } from 'bullmq';
import { SettingEnum } from 'src/shared/enum/setting.enum';
import { UsdtTx } from 'src/public/entity/usdt-tx.entity';
import { GameTx } from 'src/public/entity/gameTx.entity';
import { TxStatus } from 'src/shared/enum/status.enum';
import { PointTxType, WalletTxType } from 'src/shared/enum/txType.enum';

/**
 * How deposit works
 * 1. deposit-bot access via api/v1/wallet/deposit
 * 2. processDeposit() create pending walletTx, depositTx and Adds it to queue of type `DEPOSIT_ESCROW`.
 * 3. handleEscrowTx() is executed by the queue, transfers the  deposited token(i.e. USDT) to escrow wallet
 *    once success, set depositTx status to success and create pending gameUsdTx, otherwise retry again by the queue.
 * 4. handleGameUsdTx() transfer GameUSD to user wallet.
 *    once success, set gameUsdTx status to success and proceed to handleGameUsdTxHash()
 * 5. handleGameUsdTxHash() update walletTx status to success, update userWallet.walletBalance,
 *    create pointTx & update user userWallet.pointBalance, and proceed with handleReferralFlow()
 * 6. handleReferralFlow() create referral pointTx and update referral userWallet.pointBalance if user has referral.
 */

@Injectable()
export class DepositService implements OnModuleInit {
  private readonly logger = new Logger(DepositService.name);

  constructor(
    @InjectRepository(UserWallet)
    private userWalletRepository: Repository<UserWallet>,
    private readonly configService: ConfigService,
    private adminNotificationService: AdminNotificationService,
    private dataSource: DataSource,
    private readonly pointService: PointService,
    private readonly userService: UserService,
    private eventEmitter: EventEmitter2,
    private queueService: QueueService,
  ) {}
  onModuleInit() {
    this.queueService.registerHandler(
      QueueName.DEPOSIT,
      QueueType.DEPOSIT_ESCROW,
      {
        jobHandler: this.handleEscrowTx.bind(this),
        failureHandler: this.onEscrowTxFailed.bind(this),
      },
    );

    this.queueService.registerHandler(
      QueueName.DEPOSIT,
      QueueType.DEPOSIT_GAMEUSD_ONCHAIN,
      {
        jobHandler: this.handleGameUsdTx.bind(this),
        failureHandler: this.onGameUsdTxFailed.bind(this),
      },
    );

    this.queueService.registerHandler(
      QueueName.DEPOSIT,
      QueueType.DEPOSIT_GAMEUSD_DB,
      {
        jobHandler: this.handleGameUsdTxHash.bind(this),
        failureHandler: this.onGameUsdTxHashFailed.bind(this),
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
      if (!userWallet) {
        throw new BadRequestException(
          `UserWallet for walletAddress ${payload.walletAddress} not found`,
        );
      }

      const user = await queryRunner.manager.findOne(User, {
        where: {
          id: userWallet.userId,
        },
      });
      if (!user) {
        throw new BadRequestException(
          `User for walletId ${userWallet.id} not found`,
        );
      }

      const miniGameUSDTSenderSetting = await queryRunner.manager.findOne(
        Setting,
        {
          where: {
            key: SettingEnum.MINI_GAME_USDT_SENDER_ADDRESS,
          },
        },
      );
      const miniGameUSDTSender =
        miniGameUSDTSenderSetting?.value.toLowerCase() || '';

      if (
        payload.amount < 1 &&
        payload.depositerAddress.toLowerCase() !== miniGameUSDTSender
      ) {
        // deposit amount less than $1, inform admin and do nothing
        await this.adminNotificationService.setAdminNotification(
          `Error processing deposit for wallet: ${payload.walletAddress} \n
          Minimum Deposit Amount not met. \n
          UserId: ${user.id}. \n
          Deposit amount: $${payload.amount} \n
          TxHash: ${payload.txHash}`,
          'MINIMUM_DEPOSIT_AMOUNT',
          'Deposit Failed',
          false,
          true,
        );
        return;
      }

      const deposit_notify_threshold = await queryRunner.manager.findOne(
        Setting,
        {
          where: {
            key: SettingEnum.DEPOSIT_NOTIFY_THRESHOLD,
          },
        },
      );
      const canProceed =
        payload.amount <= Number(deposit_notify_threshold.value);

      const depositTx = await this._processDeposit(
        payload,
        queryRunner,
        canProceed,
        userWallet,
      );

      await queryRunner.commitTransaction();

      if (canProceed) {
        await this.addToEscrowQueue(depositTx.id);
      } else {
        // deposit amount more than deposit_notify_threshold, inform admin
        await this.adminNotificationService.setAdminNotification(
          `Deposit of $${payload.amount} by ${payload.tokenAddress} received at ${payload.walletAddress}. Please Approve/Reject in backOffice`,
          'DEPOSIT_THRESHOLD_NOTIFICATION',
          'Deposit Threshold Notification',
          false,
          true,
        );
      }

      if (user.referralUserId) {
        await this.adminNotificationService.setAdminNotification(
          `User ${user.uid}, referred by ${user.referralUserId}, has deposited ${payload.amount} USD`,
          'REFERRAL_SUCCESS',
          'Referral Success',
          false,
          true,
        );
      } else {
        await this.adminNotificationService.setAdminNotification(
          `Deposit of ${payload.amount} by ${payload.tokenAddress} received at ${payload.walletAddress}`,
          'DEPOSIT_RECEIVED',
          'Deposit Received',
          false,
          true,
        );
      }
    } catch (error) {
      // queryRunner
      this.logger.error(
        'processDeposit() error within queryRunner, error:',
        error,
      );
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
    canProceed: boolean = true,
    userWallet: UserWallet,
  ) {
    try {
      let walletTx = new WalletTx();
      walletTx.usdtTx = null;
      walletTx.gameTx = null;
      walletTx.txType = WalletTxType.DEPOSIT;
      walletTx.txAmount = payload.amount;
      walletTx.txHash = payload.txHash;
      walletTx.status = canProceed ? TxStatus.PENDING : TxStatus.PENDING_ADMIN;
      walletTx.userWalletId = userWallet.id;
      walletTx.userWallet = userWallet;

      if (payload.usdtTxId) {
        const usdtTx = await queryRunner.manager.findOne(UsdtTx, {
          where: { id: payload.usdtTxId },
          relations: ['walletTx'],
        });
        if (!usdtTx) {
          throw new BadRequestException(
            `usdt_tx for id ${payload.usdtTxId} not found`,
          );
        }

        const gameTx = await queryRunner.manager.findOne(GameTx, {
          where: {
            usdtTx,
          },
        });
        // if admin is transferring usdt, gameTx will be null so don't throw error
        if (!gameTx && usdtTx.txType != 'CAMPAIGN') {
          throw new BadRequestException(
            `game_tx for usdt_tx.id ${payload.usdtTxId} not found`,
          );
        }

        //Already have a walletTx if the txType is CAMPAIGN
        if (usdtTx.txType == 'CAMPAIGN') {
          walletTx = usdtTx.walletTx;
        } else {
          walletTx.gameTx = gameTx;
          walletTx.usdtTx = usdtTx;
          walletTx.txType = WalletTxType.GAME_TRANSACTION;

          await queryRunner.manager.save(walletTx);
          gameTx.walletTx = walletTx;
          usdtTx.walletTx = walletTx;
          usdtTx.walletTxId = walletTx.id;
          await queryRunner.manager.save(gameTx);
          await queryRunner.manager.save(usdtTx);
        }
      }

      const walletTxResult = await queryRunner.manager.save(walletTx);

      // create depositTx with status pending
      const depositTx = new DepositTx();
      depositTx.currency = payload.tokenAddress;
      depositTx.senderAddress = payload.depositerAddress;
      depositTx.receiverAddress = payload.walletAddress;
      depositTx.chainId = payload.chainId;
      depositTx.isTransferred = false;
      depositTx.status = canProceed ? TxStatus.PENDING : TxStatus.PENDING_ADMIN;
      depositTx.walletTxId = walletTxResult.id;
      depositTx.walletTx = walletTx;
      await queryRunner.manager.save(depositTx);

      // reload user wallet if needed
      const baseChainId = Number(this.configService.get('BASE_CHAIN_ID'));
      if (payload.chainId !== baseChainId) {
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
        baseChainId,
      );

      return depositTx;
    } catch (error) {
      this.logger.error('processDeposit() error:', error);
      throw error;
    }
  }

  /// Used by Admin to approve/reject deposit
  async processDepositAdmin(payload: ReviewDepositDto) {
    const { depositTxId, note, status } = payload;
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const depositTx = await queryRunner.manager.findOne(DepositTx, {
        where: {
          id: depositTxId,
        },
        relations: ['walletTx'],
      });
      if (!depositTx) {
        throw new BadRequestException('Deposit not found');
      }

      if (depositTx.status != 'PA' || depositTx.walletTx.status != 'PA') {
        throw new BadRequestException('Deposit already processed by admin');
      }

      const dbStatus = status ? TxStatus.PENDING : TxStatus.FAILED;
      depositTx.status = dbStatus;
      depositTx.walletTx.status = dbStatus;
      depositTx.walletTx.note = note;

      await queryRunner.manager.save(depositTx);
      await queryRunner.manager.save(depositTx.walletTx);
      await queryRunner.commitTransaction();

      if (status) {
        await this.addToEscrowQueue(depositTx.id);
      }
    } catch (error) {
      this.logger.error(`processDepositAdmin() error: ${error}`);
      await queryRunner.rollbackTransaction();

      throw new BadRequestException(
        `Error processing deposit: ${error.message}`,
      );
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  async addToEscrowQueue(depositTxId: number) {
    try {
      // add job to queue
      const jobId = `escrow-${depositTxId}`;
      await this.queueService.addJob(QueueName.DEPOSIT, jobId, {
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
      await this.queueService.addJob(QueueName.DEPOSIT, jobId, {
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
        // .orderBy('depositTx.id', 'ASC')
        .getOne();
      if (!depositTx) {
        await queryRunner.release();

        //add to next queue here
        return;
      }

      if (depositTx.isTransferred) {
        // this block reached normally because of retryDeposit() and
        // handleEscrowTx() is done because depositTx.isTransferred is true
        // so proceed to handleGameUsdTx()
        const gameUsdTx = await queryRunner.manager.findOne(GameUsdTx, {
          where: {
            walletTxId: depositTx.walletTxId,
          },
        });

        if (gameUsdTx) {
          await this.queueService.addJob(
            QueueName.DEPOSIT,
            `gameusd-${gameUsdTx.id}`,
            {
              gameUsdTxId: gameUsdTx.id,
              queueType: QueueType.DEPOSIT_GAMEUSD_ONCHAIN,
            },
          );
        }

        return;
      }

      // const userWallet = await queryRunner.manager.findOne(UserWallet, {
      //   where: {
      //     id: depositTx.walletTx.userWalletId,
      //   },
      // });
      // if get private key failed, into catch block and retry again in next cron job
      const userSigner = await this.getSigner(
        depositTx.walletTx.userWallet.walletAddress,
        depositTx.chainId,
      );
      const tokenContract = this.getTokenContract(
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
      const receipt = await onchainEscrowTx.wait();
      const onchainEscrowTxHash = onchainEscrowTx.hash;

      if (receipt && receipt.status == 1) {
        // transfer token transaction success
        depositTx.isTransferred = true;
        depositTx.status = TxStatus.SUCCESS;
        depositTx.txHash = onchainEscrowTxHash;
        await queryRunner.manager.save(depositTx);

        const gameUsdTx = new GameUsdTx();
        gameUsdTx.amount = depositTx.walletTx.txAmount;
        gameUsdTx.chainId = +this.configService.get('BASE_CHAIN_ID');
        gameUsdTx.status = TxStatus.PENDING;
        gameUsdTx.senderAddress = this.configService.get(
          'GAMEUSD_POOL_CONTRACT_ADDRESS',
        );
        gameUsdTx.receiverAddress = depositTx.walletTx.userWallet.walletAddress;
        gameUsdTx.walletTxId = depositTx.walletTx.id;
        gameUsdTx.walletTxs = [depositTx.walletTx];
        const tx = await queryRunner.manager.save(gameUsdTx);

        await queryRunner.commitTransaction();

        await this.queueService.addJob(
          QueueName.DEPOSIT,
          `gameusd-${gameUsdTx.id}`,
          {
            gameUsdTxId: tx.id,
            queueType: QueueType.DEPOSIT_GAMEUSD_ONCHAIN,
          },
        );
      } else if (receipt && receipt.status != 1) {
        throw new Error(
          `Escrow transaction failed with hash: ${onchainEscrowTxHash}`,
        );
      }
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

        depositTx.status = TxStatus.FAILED;
        depositTx.walletTx.status = TxStatus.FAILED;
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

  private getTokenContract(tokenAddress: string, signer: ethers.Wallet) {
    return ERC20__factory.connect(tokenAddress, signer);
  }

  private async transferToken(
    tokenContract: ERC20,
    to: string,
    amount: bigint,
  ) {
    const gasLimit = await tokenContract.transfer.estimateGas(to, amount);
    return await tokenContract.transfer(to, amount, {
      gasLimit: gasLimit + (gasLimit * BigInt(30)) / BigInt(100),
    });
  }

  // Step2: transfer GameUSD to user wallet.
  private async handleGameUsdTx(job: Job<{ gameUsdTxId: number }>) {
    const { gameUsdTxId } = job.data;
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const gameUsdTx = await queryRunner.manager.findOne(GameUsdTx, {
        where: {
          id: gameUsdTxId,
        },
      });

      if (gameUsdTx.status == TxStatus.SUCCESS) {
        // this block reached normally because of retryDeposit() and
        // handleGameUsdTx() is done because gameUsdTx.status is true
        // so proceed to handleGameUsdTxHash()
        await queryRunner.release();

        const jobId = `updateStatus-${gameUsdTx.id}`;
        await this.queueService.addJob(QueueName.DEPOSIT, jobId, {
          gameUsdTxId: gameUsdTx.id,
          queueType: QueueType.DEPOSIT_GAMEUSD_DB,
        });

        return;
      }

      const signer = await this.getSigner(
        // use deposit bot for normal deposit(>=1 USD),
        // else use credit bot for credit deposit
        gameUsdTx.amount >= 1
          ? this.configService.get('DEPOSIT_BOT_ADDRESS')
          : this.configService.get('CREDIT_BOT_ADDRESS'),
        gameUsdTx.chainId,
      );

      const onchainGameUsdTx = await this.depositGameUSD(
        gameUsdTx.receiverAddress,
        parseEther(gameUsdTx.amount.toString()),
        signer,
      );

      // reload deposit admin wallet if needed
      this.eventEmitter.emit(
        'gas.service.reload',
        await signer.getAddress(),
        gameUsdTx.chainId,
      );

      // check on-chain tx status
      const txReceipt = await onchainGameUsdTx.wait();
      if (txReceipt && txReceipt.status == 1) {
        // transfer GameUSD transaction success
        gameUsdTx.status = TxStatus.SUCCESS;
        gameUsdTx.txHash = onchainGameUsdTx.hash;
        await queryRunner.manager.save(gameUsdTx);

        // handles the db part of gameUsdTx sent to user address.
        await queryRunner.commitTransaction();
        const jobId = `updateStatus-${gameUsdTx.id}`;
        await this.queueService.addJob(QueueName.DEPOSIT, jobId, {
          gameUsdTxId: gameUsdTx.id,
          queueType: QueueType.DEPOSIT_GAMEUSD_DB,
        });
      } else {
        // transfer GameUSD transaction failed, try again in next job
        throw new Error(
          `GameUSD transaction failed with hash: ${gameUsdTx.txHash}`,
        );
      }
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new Error(`Error handleGameUsdTx: ${error}`);
    } finally {
      await queryRunner.release();
    }
  }

  private async onGameUsdTxFailed(
    job: Job<{ gameUsdTxId: number }>,
    error: Error,
  ) {
    const { gameUsdTxId } = job.data;
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const gameUsdTx = await queryRunner.manager.findOne(GameUsdTx, {
        where: {
          id: gameUsdTxId,
        },
      });

      if (job.attemptsMade > job.opts.attempts) {
        gameUsdTx.status = TxStatus.FAILED;
        await queryRunner.manager.save(gameUsdTx);
        // set walletTx status to failed
        await queryRunner.manager.update(
          WalletTx,
          { id: gameUsdTx.walletTxId },
          { status: TxStatus.FAILED },
        );

        await this.adminNotificationService.setAdminNotification(
          `GameUSD transaction after 5 times for gameUsdTx id: ${gameUsdTx.id}`,
          'GAMEUSD_TX_FAILED_5_TIMES',
          'GameUSD transfer failed',
          true,
          true,
          gameUsdTx.walletTxId,
        );
      } else {
        this.logger.error('handleGameUsdTx() error:', error);
        gameUsdTx.retryCount += 1;
        await queryRunner.manager.save(gameUsdTx);
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      this.logger.error('Error in onGameUsdTxFailed', error);
      const gameUsdTx = await queryRunner.manager.findOne(GameUsdTx, {
        where: {
          id: gameUsdTxId,
        },
      });

      await this.adminNotificationService.setAdminNotification(
        `Critical Error in onGameUsdTxFailed() for gameUsdTx id: ${gameUsdTx.id}`,
        'CRITICAL_ERROR',
        'Critical Error in onGameUsdTxFailed()',
        true,
        true,
        gameUsdTx.walletTxId,
      );
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
  private async handleGameUsdTxHash(job: Job<{ gameUsdTxId: number }>) {
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

      const user = await queryRunner.manager.findOne(User, {
        where: {
          id: walletTx.userWallet.userId,
        },
      });

      // update walletTx
      walletTx.status = TxStatus.SUCCESS;
      walletTx.startingBalance = walletTx.userWallet.walletBalance;
      walletTx.endingBalance =
        (Number(walletTx.startingBalance) || 0) + Number(gameUsdTx.amount);
      await queryRunner.manager.save(walletTx);

      // update userWallet walletBalance
      walletTx.userWallet.walletBalance = walletTx.endingBalance;

      // create user pointTx
      const depositTx = await queryRunner.manager.findOne(DepositTx, {
        where: {
          status: TxStatus.SUCCESS,
          walletTxId: walletTx.id,
        },
      });

      const miniGameUSDTSenderSetting = await queryRunner.manager.findOne(
        Setting,
        {
          where: {
            key: SettingEnum.MINI_GAME_USDT_SENDER_ADDRESS,
          },
        },
      );
      const miniGameUSDTSender =
        miniGameUSDTSenderSetting?.value.toLowerCase() || '';

      if (depositTx.senderAddress.toLowerCase() !== miniGameUSDTSender) {
        const pointInfo = this.pointService.getDepositPoints(
          Number(walletTx.txAmount),
        );
        const lastValidPointTx = await this.lastValidPointTx(
          walletTx.userWallet.id,
        );

        const pointTxAmount =
          pointInfo.xp + (walletTx.txAmount * pointInfo.bonusPerc) / 100;
        const pointTxStartingBalance = walletTx.userWallet.pointBalance;
        const pointTxEndingBalance =
          Number(pointTxStartingBalance) + Number(pointTxAmount);
        const pointTx = new PointTx();
        pointTx.txType = walletTx.txType as unknown as PointTxType; //'DEPOSIT';
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
      }

      await queryRunner.manager.save(walletTx.userWallet);

      if (depositTx.senderAddress.toLowerCase() !== miniGameUSDTSender) {
        await this.handleReferralFlow(
          user.id,
          walletTx.txAmount,
          walletTx.id,
          queryRunner,
        );
      }

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

  private async onGameUsdTxHashFailed(
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

        gameUsdTx.walletTxs[0].status = TxStatus.FAILED;
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
        this.logger.error('Error in onGameUsdTxHashFailed', error);
      } finally {
        // in case it reaches catch block before releasing the queryRunner
        if (!queryRunner.isReleased) await queryRunner.release();
      }
    }
  }

  // private async lastValidWalletTx(userWalletId: number) {
  //   return await this.dataSource.manager.findOne(WalletTx, {
  //     where: {
  //       userWalletId,
  //       status: TxStatus.SUCCESS,
  //     },
  //     order: {
  //       createdDate: 'DESC',
  //     },
  //   });
  // }

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
    walletTxId: number,
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

      const ignoredReferrersSetting = await queryRunner.manager.findOne(
        Setting,
        {
          where: {
            key: SettingEnum.FILTERED_REFERRAL_CODES,
          },
        },
      );

      const ignoredRefferers: Array<string> | null =
        ignoredReferrersSetting.value
          ? JSON.parse(ignoredReferrersSetting.value)
          : null;

      if (
        ignoredRefferers &&
        ignoredRefferers.length > 0 &&
        ignoredRefferers.includes(userInfo.referralUser.referralCode)
      ) {
        return;
      }
      // create pointTx
      const referrerXp = this.pointService.getReferralDepositXp(
        Number(depositAmount),
      );
      const pointTx = new PointTx();
      pointTx.txType = PointTxType.REFERRAL;
      pointTx.amount = referrerXp;
      pointTx.startingBalance = userInfo.referralUser.wallet.pointBalance;
      pointTx.endingBalance =
        Number(pointTx.startingBalance) + Number(pointTx.amount);
      pointTx.walletTxId = walletTxId;
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
