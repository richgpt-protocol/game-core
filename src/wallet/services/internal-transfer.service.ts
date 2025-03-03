import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { DataSource, Repository } from 'typeorm';
import { InternalTransfer } from '../entities/internal-transfer.entity';
import { TransferGameUSDDto, SendMode } from '../dto/InternalTransferDto';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';
import { ConfigService } from 'src/config/config.service';
import { GameUSD__factory } from 'src/contract';
import { JsonRpcProvider, Wallet, parseUnits } from 'ethers';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { WalletService } from 'src/wallet/wallet.service';
import { UserService } from 'src/user/user.service';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { ReloadTx } from 'src/wallet/entities/reload-tx.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MPC } from 'src/shared/mpc';
import { User } from 'src/user/entities/user.entity';
import * as bcrypt from 'bcrypt';
import { WalletTxType } from 'src/shared/enum/txType.enum';
import { TxStatus } from 'src/shared/enum/status.enum';
import { FCMService } from 'src/shared/services/fcm.service';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class InternalTransferService {
  private readonly logger = new Logger(InternalTransferService.name);

  constructor(
    @InjectRepository(UserWallet)
    private walletRepository: Repository<UserWallet>,
    @InjectRepository(InternalTransfer)
    private internalTransferRepository: Repository<InternalTransfer>,
    @InjectRepository(WalletTx)
    private walletTxRepository: Repository<WalletTx>,
    @InjectRepository(GameUsdTx)
    private gameUsdTxRepository: Repository<GameUsdTx>,
    @InjectRepository(PointTx)
    private pointTxRepository: Repository<PointTx>,
    @InjectRepository(ReloadTx)
    private reloadTxRepository: Repository<ReloadTx>,
    private walletService: WalletService,
    private userService: UserService,
    private adminNotificationService: AdminNotificationService,
    private fcmService: FCMService,
    private configService: ConfigService,
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
    private i18n: I18nService,
  ) {}

  async transferGameUSD(userId: number, payload: TransferGameUSDDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const senderInfo = await queryRunner.manager
        .createQueryBuilder(User, 'user')
        .leftJoinAndSelect('user.wallet', 'wallet')
        .where('user.id = :userId', { userId })
        .getOne();

      const senderWallet = senderInfo.wallet;

      if (!senderInfo.withdrawPin) {
        throw new BadRequestException('Withdraw pin not set');
      }

      const isPinVerified = await bcrypt.compare(
        payload.pin,
        senderInfo.withdrawPin,
      );

      if (!isPinVerified) {
        throw new BadRequestException('Invalid pin');
      }

      if (payload.amount < 1) {
        throw new BadRequestException('Minimum transfer amount is $1');
      }

      const query = queryRunner.manager
        .createQueryBuilder(UserWallet, 'wallet')
        .innerJoin('wallet.user', 'user');

      if (payload.sendMode == SendMode.phone) {
        query.where('user.phoneNumber = :phoneNumber', {
          phoneNumber: payload.receiver,
        });
      } else {
        query.where('user.uid = :uid', { uid: payload.receiver });
      }

      const receiverWallet = await query.getOne();

      if (!receiverWallet) {
        throw new BadRequestException('Receiver wallet not found');
      }

      if (senderWallet.id == receiverWallet.id) {
        throw new BadRequestException('Cannot transfer to self');
      }

      await this.validateLevel(senderWallet);
      const pendingAmountResult = await queryRunner.manager.query(
        `SELECT SUM(txAmount) as pendingAmount FROM wallet_tx
          WHERE
            userWalletId = ${senderWallet.id} AND
            txType IN ('REDEEM', 'PLAY', 'INTERNAL_TRANSFER') AND
            status IN ('P', 'PD', 'PA')`,
      );

      const pendingAmount = Number(pendingAmountResult[0]?.pendingAmount) || 0;
      const availableBalance =
        pendingAmount >= senderWallet.walletBalance
          ? 0
          : senderWallet.walletBalance - pendingAmount;

      if (
        senderWallet.walletBalance == 0 ||
        availableBalance < payload.amount
      ) {
        throw new BadRequestException('Insufficient balance');
      }

      const senderWalletTx = new WalletTx();
      senderWalletTx.txType = WalletTxType.INTERNAL_TRANSFER;
      senderWalletTx.txAmount = payload.amount;
      senderWalletTx.status = TxStatus.PENDING;
      senderWalletTx.userWalletId = senderWallet.id;
      senderWalletTx.userWallet = senderWallet;
      await queryRunner.manager.save(senderWalletTx);

      const receiverWalletTx = new WalletTx();
      receiverWalletTx.txType = WalletTxType.INTERNAL_TRANSFER;
      receiverWalletTx.txAmount = payload.amount;
      receiverWalletTx.status = TxStatus.PENDING;
      receiverWalletTx.userWalletId = receiverWallet.id;
      receiverWalletTx.userWallet = receiverWallet;
      await queryRunner.manager.save(receiverWalletTx);

      const gameUsdTx = new GameUsdTx();
      gameUsdTx.amount = payload.amount;
      gameUsdTx.chainId = +this.configService.get('BASE_CHAIN_ID');
      gameUsdTx.status = TxStatus.PENDING;
      gameUsdTx.senderAddress = senderWallet.walletAddress;
      gameUsdTx.receiverAddress = receiverWallet.walletAddress;
      gameUsdTx.retryCount = 0;
      gameUsdTx.walletTxId = senderWalletTx.id;
      gameUsdTx.walletTxs = [senderWalletTx, receiverWalletTx];
      await queryRunner.manager.save(gameUsdTx);

      const internalTransfer = new InternalTransfer();
      internalTransfer.senderWalletTxId = senderWalletTx.id;
      internalTransfer.senderWalletTx = senderWalletTx;
      internalTransfer.receiverWalletTxId = receiverWalletTx.id;
      internalTransfer.receiverWalletTx = receiverWalletTx;
      await queryRunner.manager.save(internalTransfer);

      senderWalletTx.internalTransferSender = internalTransfer;
      senderWalletTx.gameUsdTx = gameUsdTx;
      await queryRunner.manager.save(senderWalletTx);

      receiverWalletTx.internalTransferReceiver = internalTransfer;
      receiverWalletTx.gameUsdTx = gameUsdTx;
      await queryRunner.manager.save(receiverWalletTx);

      await queryRunner.commitTransaction();

      this.eventEmitter.emit('internal-transfer', {
        senderWalletTx,
        receiverWalletTx,
        gameUsdTx,
      });
    } catch (error) {
      this.logger.error(error);
      await queryRunner.rollbackTransaction();
      if (error instanceof BadRequestException) {
        throw new BadRequestException(error.message);
      } else {
        throw new BadRequestException('Internal transfer failed');
      }
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  @OnEvent('internal-transfer', { async: true })
  async handleInternalTransferEvent(payload: {
    senderWalletTx: WalletTx;
    receiverWalletTx: WalletTx;
    gameUsdTx: GameUsdTx;
  }) {
    const { senderWalletTx, gameUsdTx } = payload;

    const hasNativeBalance = await this.checkNativeBalance(
      senderWalletTx.userWallet,
      gameUsdTx.chainId,
    );

    if (!hasNativeBalance) {
      this.eventEmitter.emit(
        'gas.service.reload',
        senderWalletTx.userWallet.walletAddress,
        this.configService.get('BASE_CHAIN_ID'),
      );

      //increase retry count so that it will be picked up by retry cron
      gameUsdTx.retryCount += 1;
      await this.gameUsdTxRepository.save(gameUsdTx);

      return;
    } else {
      await this.processTransfer(payload);
    }
  }

  isRetryCronRunning = false;
  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleRetryCron() {
    if (this.isRetryCronRunning) {
      return;
    }

    this.isRetryCronRunning = true;

    try {
      const pendingGameUsdTxns = await this.gameUsdTxRepository
        .createQueryBuilder('gameUsdTx')
        .leftJoinAndSelect('gameUsdTx.walletTxs', 'walletTx')
        .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
        .where('gameUsdTx.status = :status', { status: 'P' })
        .andWhere('gameUsdTx.retryCount > 0')
        .andWhere('walletTx.txType = :txType', {
          txType: WalletTxType.INTERNAL_TRANSFER,
        })
        .getMany();

      for (const gameUsdTx of pendingGameUsdTxns) {
        try {
          if (gameUsdTx.retryCount >= 5) {
            gameUsdTx.status = TxStatus.FAILED;
            await this.gameUsdTxRepository.save(gameUsdTx);

            const senderWalletTx = gameUsdTx.walletTxs.find(
              (tx) => tx.userWallet.walletAddress == gameUsdTx.senderAddress,
            );
            senderWalletTx.status = TxStatus.FAILED;
            await this.walletTxRepository.save(senderWalletTx);

            const receiverWalletTx = gameUsdTx.walletTxs.find(
              (tx) => tx.userWallet.walletAddress == gameUsdTx.receiverAddress,
            );
            receiverWalletTx.status = TxStatus.FAILED;
            await this.walletTxRepository.save(receiverWalletTx);

            this.adminNotificationService.setAdminNotification(
              `Error in retry cron for internal transfer when processing gameUsdTx : ${gameUsdTx.id}`,
              'INTERNAL_TRANSFER_RETRY_CRON_FAILED',
              'Internal Transfer Retry Cron Failed',
              false,
            );

            continue;
          }
          //Invoking the processTransfer method directly instead of emitting event.
          //This is done to avoid triggering the transfer process multiple times, as the events won't wait for the previous call to complete(async).
          await this.processTransfer({
            senderWalletTx: gameUsdTx.walletTxs.find(
              (tx) => tx.userWallet.walletAddress == gameUsdTx.senderAddress,
            ),
            receiverWalletTx: gameUsdTx.walletTxs.find(
              (tx) => tx.userWallet.walletAddress == gameUsdTx.receiverAddress,
            ),
            gameUsdTx,
          });
        } catch (error) {
          //Internal catch. Catches error in processing individual gameUsdTx.
          this.logger.error('InAppTransferError Error in retry cron', error);

          gameUsdTx.retryCount += 1;
          await this.gameUsdTxRepository.save(gameUsdTx);
        }
      }

      this.isRetryCronRunning = false;
    } catch (error) {
      this.logger.error('InAppTransferError: Error in retry cron', error);
      this.isRetryCronRunning = false;
    }

    // this.isRetryCronRunning = false;
  }

  private async processTransfer(payload: {
    senderWalletTx: WalletTx;
    receiverWalletTx: WalletTx;
    gameUsdTx: GameUsdTx;
  }) {
    const { senderWalletTx, receiverWalletTx, gameUsdTx } = payload;

    // const hasNativeBalance = await this.checkNativeBalance(
    //   senderWalletTx.userWallet,
    //   gameUsdTx.chainId,
    // );

    // if (!hasNativeBalance) {
    //   return;
    // }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let senderUserWallet: UserWallet;
    let receiverUserWallet: UserWallet;

    try {
      // const senderLastValidWalletTx = await this.getLastValidWalletTx(
      //   senderWalletTx.userWalletId,
      // );
      // const receiverLastValidWalletTx = await this.getLastValidWalletTx(
      //   receiverWalletTx.userWalletId,
      // );

      senderUserWallet = senderWalletTx.userWallet;
      receiverUserWallet = receiverWalletTx.userWallet;

      const provider = new JsonRpcProvider(
        this.configService.get(
          'PROVIDER_RPC_URL_' + this.configService.get('BASE_CHAIN_ID'),
        ),
      );

      const userSigner = new Wallet(
        await MPC.retrievePrivateKey(senderUserWallet.walletAddress),
        provider,
      );

      const gameUSDTokenContract = GameUSD__factory.connect(
        this.configService.get('GAMEUSD_CONTRACT_ADDRESS'),
        userSigner,
      );

      const decimals = await gameUSDTokenContract.decimals();

      const amountParsed = parseUnits(gameUsdTx.amount.toString(), decimals);
      const estimatedGas = await gameUSDTokenContract.transfer.estimateGas(
        receiverUserWallet.walletAddress,
        amountParsed,
      );

      try {
        const tx = await gameUSDTokenContract.transfer(
          receiverUserWallet.walletAddress,
          amountParsed,
          {
            gasLimit: estimatedGas + (estimatedGas * BigInt(30)) / BigInt(100),
          },
        );
        const receipt = await tx.wait();

        if (receipt && receipt.status == 1) {
          senderWalletTx.status = TxStatus.SUCCESS;
          receiverWalletTx.status = TxStatus.SUCCESS;
          gameUsdTx.status = TxStatus.SUCCESS;
          gameUsdTx.txHash = tx.hash;

          senderWalletTx.txHash = tx.hash;
          receiverWalletTx.txHash = tx.hash;

          senderWalletTx.startingBalance = senderUserWallet.walletBalance;
          senderWalletTx.endingBalance =
            Number(senderWalletTx.startingBalance) -
            Number(senderWalletTx.txAmount);

          receiverWalletTx.startingBalance = receiverUserWallet.walletBalance;
          receiverWalletTx.endingBalance =
            Number(receiverWalletTx.startingBalance) +
            Number(senderWalletTx.txAmount);

          senderUserWallet.walletBalance =
            Number(senderUserWallet.walletBalance) -
            Number(senderWalletTx.txAmount);

          receiverUserWallet.walletBalance =
            Number(receiverUserWallet.walletBalance) +
            Number(senderWalletTx.txAmount);

          const senderUserLanguage = await this.userService.getUserLanguage(
            senderUserWallet.userId,
          );
          await this.userService.setUserNotification(senderUserWallet.userId, {
            type: 'Transfer',
            title: 'Transfer Processed Successfully',
            message: this.i18n.translate(
              'internal-transfer.INTERNAL_TRANSFER_SUCCESS',
              {
                lang: senderUserLanguage || 'en',
              },
            ),
            walletTxId: senderWalletTx.id,
          });

          const receiverUserLanguage = await this.userService.getUserLanguage(
            receiverUserWallet.userId,
          );
          await this.userService.setUserNotification(
            receiverUserWallet.userId,
            {
              type: 'Transfer',
              title: 'Received GameUSD Transfer',
              message: this.i18n.translate(
                'internal-transfer.INTERNAL_TRANSFER_RECEIVED',
                {
                  lang: receiverUserLanguage || 'en',
                },
              ),
              walletTxId: receiverWalletTx.id,
            },
          );

          this.eventEmitter.emit(
            'gas.service.reload',
            receiverUserWallet.walletAddress,
            this.configService.get('BASE_CHAIN_ID'),
          );
        } else {
          // await this.adminNotificationService.setAdminNotification(
          //   `Error processing transfer for gameUsdTx : ${payload.gameUsdTx.id}.`,
          //   'TRANSFER_TRANSACTION_FAILED',
          //   'Transfer Failed',
          //   false,
          // );

          throw new Error('Transaction failed');
        }
      } catch (error) {
        this.logger.error(
          'InternalTransferService.processTransfer() error: ' + error,
        );

        // gameUsdTx.status = 'F';
        // senderWalletTx.status = 'F';
        // receiverWalletTx.status = 'F';
        gameUsdTx.retryCount += 1;
      }

      await queryRunner.manager.save(senderWalletTx);
      await queryRunner.manager.save(receiverWalletTx);
      await queryRunner.manager.save(gameUsdTx);
      await queryRunner.manager.save(senderUserWallet);
      await queryRunner.manager.save(receiverUserWallet);

      await queryRunner.commitTransaction();
    } catch (error) {
      this.logger.log(
        'InternalTransferService.processTransfer() error: ' + error,
      );
      await queryRunner.rollbackTransaction();

      await this.adminNotificationService.setAdminNotification(
        `Transaction Rollback in InternalTransferService.processTransfer()`,
        'TRANSACTION_ROLLBACK',
        'Transaction Rollback in InternalTransferService',
        true,
      );
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }

    if (senderUserWallet && receiverUserWallet) {
      try {
        const senderUser = await this.dataSource.manager.findOne(User, {
          where: { id: senderUserWallet.userId },
        });
        const receiverUserLanguage = await this.userService.getUserLanguage(
          receiverUserWallet.userId,
        );
        await this.fcmService.sendUserFirebase_TelegramNotification(
          receiverUserWallet.userId,
          'Internal Transfer Received',
          this.i18n.translate(
            'internal-transfer.INTERNAL_TRANSFER_RECEIVED_TG',
            {
              lang: receiverUserLanguage || 'en',
              args: {
                amount: Number(senderWalletTx.txAmount).toFixed(2),
                senderUid: senderUser.uid,
              },
            },
          ),
        );
      } catch (ex) {
        this.logger.error(
          'InternalTransferService.processTransfer() error in sending notification: ',
        );
        console.log(ex);
      }
    }
  }

  private async checkNativeBalance(
    userWallet: UserWallet,
    chainId: number,
  ): Promise<boolean> {
    try {
      const provider = new JsonRpcProvider(
        this.configService.get('PROVIDER_RPC_URL_' + chainId.toString()),
      );

      const nativeBalance = await provider.getBalance(userWallet.walletAddress);

      const minimumNativeBalance = this.configService.get(
        `MINIMUM_NATIVE_BALANCE_${chainId}`,
      );

      if (nativeBalance < parseUnits(minimumNativeBalance, 18)) {
        // const pendingReloadTx = await this.reloadTxRepository.findOne({
        //   where: {
        //     userWalletId: userWallet.id,
        //     chainId,
        //     status: 'P',
        //   },
        // });

        // if (!pendingReloadTx) {
        //   console.log(
        //     'Deposit: Emitting gas.service.reload event for userWallet:',
        //     userWallet.walletAddress,
        //   );
        //   this.eventEmitter.emit(
        //     'gas.service.reload',
        //     userWallet.walletAddress,
        //     chainId,
        //   );
        // }

        return false;
      } else {
        return true;
      }
    } catch (error) {
      this.logger.error('Error in checkNativeBalance', error);
      return false;
    }
  }

  // private async getLastValidWalletTx(userWalletId: number) {
  //   return this.walletTxRepository.findOne({
  //     where: {
  //       userWalletId: userWalletId,
  //       status: 'S',
  //     },
  //     order: {
  //       id: 'DESC',
  //     },
  //   });
  // }

  private async getTotalPoints(userWallet: UserWallet): Promise<number> {
    const points = await this.pointTxRepository.findOne({
      where: {
        userWallet,
      },
      order: {
        id: 'DESC',
      },
    });

    return points ? points.endingBalance : 0;
  }

  private async validateLevel(userWallet: UserWallet) {
    const points = await this.getTotalPoints(userWallet);
    const level = this.walletService.calculateLevel(points);
    if (level < 10) {
      throw new BadRequestException('Insufficient level');
    }
  }

  // private async getPendingAmount(senderWallet: UserWallet): Promise<number> {
  //   const pendingTransfers = await this.walletTxRepository.find({
  //     where: {
  //       userWallet: senderWallet,
  //       status: 'P',
  //     },
  //   });

  //   if (pendingTransfers.length === 0) {
  //     return 0;
  //   }

  //   return pendingTransfers.reduce((acc, tx) => acc + tx.txAmount, 0);
  // }
}
