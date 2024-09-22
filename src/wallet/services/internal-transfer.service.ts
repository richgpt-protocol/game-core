import { BadRequestException, Injectable } from '@nestjs/common';
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
@Injectable()
export class InternalTransferService {
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
    private configService: ConfigService,
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
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
        query.andWhere('user.phoneNumber = :phoneNumber', {
          phoneNumber: payload.receiver,
        });
      } else {
        query.andWhere('user.uid = :uid', { uid: payload.receiver });
      }

      const receiverWallet = await query.getOne();

      if (!receiverWallet) {
        throw new BadRequestException('Receiver wallet not found');
      }

      await this.validateLevel(senderWallet);
      const pendingAmountResult = await queryRunner.manager.query(
        `SELECT SUM(txAmount) as pendingAmount FROM wallet_tx
          WHERE
            userWalletId = ${userId} AND
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
      senderWalletTx.txAmount = payload.amount;
      senderWalletTx.txType = 'INTERNAL_TRANSFER';
      senderWalletTx.userWallet = senderWallet;
      senderWalletTx.userWalletId = senderWallet.id;
      senderWalletTx.txHash = '';
      senderWalletTx.status = 'P';

      const receiverWalletTx = new WalletTx();
      receiverWalletTx.txAmount = payload.amount;
      receiverWalletTx.txType = 'INTERNAL_TRANSFER';
      receiverWalletTx.userWallet = receiverWallet;
      receiverWalletTx.userWalletId = receiverWallet.id;
      receiverWalletTx.txHash = '';
      receiverWalletTx.status = 'P';

      await queryRunner.manager.save(senderWalletTx);
      await queryRunner.manager.save(receiverWalletTx);

      const gameUsdTx = new GameUsdTx();
      gameUsdTx.amount = payload.amount;
      gameUsdTx.status = 'P';
      gameUsdTx.walletTxs = [senderWalletTx, receiverWalletTx];
      gameUsdTx.walletTxId = senderWalletTx.id;
      gameUsdTx.senderAddress = senderWallet.walletAddress;
      gameUsdTx.receiverAddress = receiverWallet.walletAddress;
      gameUsdTx.chainId = +this.configService.get('BASE_CHAIN_ID');
      gameUsdTx.retryCount = 0;

      await queryRunner.manager.save(gameUsdTx);

      const internalTransfer = new InternalTransfer();
      internalTransfer.receiverWalletTx = receiverWalletTx;
      internalTransfer.senderWalletTx = senderWalletTx;
      internalTransfer.receiverWalletTxId = receiverWalletTx.id;
      internalTransfer.senderWalletTxId = senderWalletTx.id;

      await queryRunner.manager.save(internalTransfer);
      await queryRunner.commitTransaction();

      this.eventEmitter.emit('internal-transfer', {
        senderWalletTx,
        receiverWalletTx,
        gameUsdTx,
      });
    } catch (error) {
      console.error(error);
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
      //increase retry count so that it will be picked up by retry cron
      gameUsdTx.retryCount += 1;
      await this.gameUsdTxRepository.save(gameUsdTx);

      return;
    }

    await this.processTransfer(payload);
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
        .andWhere('walletTx.txType = :txType', { txType: 'INTERNAL_TRANSFER' })
        .getMany();

      for (const gameUsdTx of pendingGameUsdTxns) {
        try {
          if (gameUsdTx.retryCount >= 5) {
            gameUsdTx.status = 'F';
            await this.gameUsdTxRepository.save(gameUsdTx);

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
          console.error('InAppTransferError Error in retry cron', error);

          gameUsdTx.retryCount += 1;
          await this.gameUsdTxRepository.save(gameUsdTx);
        }
      }

      this.isRetryCronRunning = false;
    } catch (error) {
      console.error('InAppTransferError: Error in retry cron', error);
      this.isRetryCronRunning = false;
    }

    this.isRetryCronRunning = false;
  }

  private async processTransfer(payload: {
    senderWalletTx: WalletTx;
    receiverWalletTx: WalletTx;
    gameUsdTx: GameUsdTx;
  }) {
    const { senderWalletTx, receiverWalletTx, gameUsdTx } = payload;

    const hasNativeBalance = await this.checkNativeBalance(
      senderWalletTx.userWallet,
      gameUsdTx.chainId,
    );

    if (!hasNativeBalance) {
      return;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const lastValidWalletTxSender = await this.getLastValidWalletTx(
        senderWalletTx.userWalletId,
      );
      const lastValidWalletTxReceiver = await this.getLastValidWalletTx(
        receiverWalletTx.userWalletId,
      );

      const senderUserWallet = await queryRunner.manager.findOne(UserWallet, {
        where: {
          id: senderWalletTx.userWalletId,
        },
      });

      const receiverUserWallet = await queryRunner.manager.findOne(UserWallet, {
        where: {
          id: receiverWalletTx.userWalletId,
        },
      });

      const provider = new JsonRpcProvider(
        this.configService.get('OPBNB_PROVIDER_RPC_URL'),
      );

      const userSigner = new Wallet(
        await MPC.retrievePrivateKey(senderWalletTx.userWallet.walletAddress),
        provider,
      );

      const gameUSDContract = GameUSD__factory.connect(
        this.configService.get('GAMEUSD_CONTRACT_ADDRESS'),
        userSigner,
      );

      const decimals = await gameUSDContract.decimals();

      const amountParsed = parseUnits(gameUsdTx.amount.toString(), decimals);
      const estimatedGas = await gameUSDContract.transfer.estimateGas(
        receiverWalletTx.userWallet.walletAddress,
        amountParsed,
      );

      let tx;
      try {
        tx = await gameUSDContract.transfer(
          receiverWalletTx.userWallet.walletAddress,
          amountParsed,
          {
            gasLimit: estimatedGas + (estimatedGas * BigInt(10)) / BigInt(100),
          },
        );

        await tx.wait();

        const receipt = await provider.getTransactionReceipt(tx.hash);
        if (receipt && receipt.status == 1) {
          senderWalletTx.status = 'S';
          receiverWalletTx.status = 'S';
          gameUsdTx.status = 'S';
          gameUsdTx.txHash = tx.hash;

          senderWalletTx.txHash = tx.hash;
          receiverWalletTx.txHash = tx.hash;
          senderWalletTx.gameUsdTx = gameUsdTx;
          receiverWalletTx.gameUsdTx = gameUsdTx;

          senderWalletTx.startingBalance =
            lastValidWalletTxSender.endingBalance;
          senderWalletTx.endingBalance =
            Number(lastValidWalletTxSender.endingBalance) -
            Number(senderWalletTx.txAmount);

          receiverWalletTx.startingBalance = lastValidWalletTxReceiver
            ? lastValidWalletTxReceiver.endingBalance
            : 0;
          receiverWalletTx.endingBalance =
            Number(receiverWalletTx.startingBalance) +
            Number(senderWalletTx.txAmount);

          senderUserWallet.walletBalance =
            Number(senderUserWallet.walletBalance) -
            Number(senderWalletTx.txAmount);

          receiverUserWallet.walletBalance =
            Number(receiverUserWallet.walletBalance) +
            Number(senderWalletTx.txAmount);

          await this.userService.setUserNotification(senderUserWallet.userId, {
            type: 'Transfer',
            title: 'Transfer Processed Successfully',
            message: 'Your Transfer has been successfully processed',
            walletTxId: senderWalletTx.id,
          });

          await this.userService.setUserNotification(
            receiverUserWallet.userId,
            {
              type: 'Transfer',
              title: 'Received GameUSD Transfer',
              message: 'You have received GameUSD',
              walletTxId: receiverWalletTx.id,
            },
          );
        } else {
          await this.adminNotificationService.setAdminNotification(
            `Error processing transfer for gameUsdTx : ${payload.gameUsdTx.id}.`,
            'TRANSFER_TRANSACTION_FAILED',
            'Transfer Failed',
            false,
          );

          throw new Error('Transaction failed');
        }
      } catch (error) {
        console.error(error);

        gameUsdTx.status = 'F';
        senderWalletTx.status = 'F';
        receiverWalletTx.status = 'F';
      }

      await queryRunner.manager.save(senderWalletTx);
      await queryRunner.manager.save(receiverWalletTx);
      await queryRunner.manager.save(gameUsdTx);
      await queryRunner.manager.save(senderUserWallet);
      await queryRunner.manager.save(receiverUserWallet);

      await queryRunner.commitTransaction();
    } catch (error) {
      console.log(error);
      await queryRunner.rollbackTransaction();
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  private async checkNativeBalance(
    userWallet: UserWallet,
    chainId: number,
  ): Promise<boolean> {
    try {
      const provider = new JsonRpcProvider(
        this.configService.get('OPBNB_PROVIDER_RPC_URL'),
      );

      const nativeBalance = await provider.getBalance(userWallet.walletAddress);

      const minimumNativeBalance = this.configService.get(
        `MINIMUM_NATIVE_BALANCE_${chainId}`,
      );

      if (nativeBalance < parseUnits(minimumNativeBalance, 18)) {
        const pendingReloadTx = await this.reloadTxRepository.findOne({
          where: {
            userWalletId: userWallet.id,
            chainId,
            status: 'P',
          },
        });

        if (!pendingReloadTx) {
          console.log(
            'Deposit: Emitting gas.service.reload event for userWallet:',
            userWallet.walletAddress,
          );
          this.eventEmitter.emit(
            'gas.service.reload',
            userWallet.walletAddress,
            chainId,
          );
        }

        return false;
      } else {
        return true;
      }
    } catch (error) {
      console.error('Error in checkNativeBalance', error);
      return false;
    }
  }

  private async getLastValidWalletTx(userWalletId: number) {
    return this.walletTxRepository.findOne({
      where: {
        userWalletId: userWalletId,
        status: 'S',
      },
      order: {
        id: 'DESC',
      },
    });
  }

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

  private async getPendingAmount(senderWallet: UserWallet): Promise<number> {
    const pendingTransfers = await this.walletTxRepository.find({
      where: {
        userWallet: senderWallet,
        status: 'P',
      },
    });

    if (pendingTransfers.length === 0) {
      return 0;
    }

    return pendingTransfers.reduce((acc, tx) => acc + tx.txAmount, 0);
  }
}
