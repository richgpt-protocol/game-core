import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { DataSource, Repository } from 'typeorm';
import { InternalTransfer } from './entities/internal-transfer.entity';
import { TransferGameUSDDto, SendMode } from './dto/InternalTransferDto';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';
import { ConfigService } from 'src/config/config.service';
import { GameUSD__factory } from 'src/contract';
import { JsonRpcProvider, Wallet, parseUnits } from 'ethers';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { User } from 'src/user/entities/user.entity';

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
    // private walletService: WalletService,
    private configService: ConfigService,
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
  ) {}

  async transferGameUSD(userId: number, payload: TransferGameUSDDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const senderWallet = await queryRunner.manager
        .createQueryBuilder(UserWallet, 'wallet')
        .where({ userId: userId })
        .getOne();

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
      const pendingTransferAmount = await this.getPendingAmount(senderWallet);
      const availableBalance =
        senderWallet.redeemableBalance - pendingTransferAmount;

      if (
        senderWallet.redeemableBalance == 0 ||
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
      // gameUsdTx.walletTxId = 0; //TODO
      gameUsdTx.senderAddress = senderWallet.walletAddress;
      gameUsdTx.receiverAddress = receiverWallet.walletAddress;
      gameUsdTx.chainId = +this.configService.get('GAMEUSD_CHAIN_ID');
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
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const { senderWalletTx, receiverWalletTx, gameUsdTx } = payload;

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

      const provider = new JsonRpcProvider(this.configService.get('RPC_URL'));

      const userSigner = new Wallet(
        senderWalletTx.userWallet.privateKey,
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

          senderUserWallet.redeemableBalance =
            Number(senderUserWallet.redeemableBalance) -
            Number(senderWalletTx.txAmount);
          senderUserWallet.walletBalance =
            Number(senderUserWallet.walletBalance) -
            Number(senderWalletTx.txAmount);

          receiverUserWallet.redeemableBalance =
            Number(receiverUserWallet.redeemableBalance) +
            Number(senderWalletTx.txAmount);
          receiverUserWallet.walletBalance =
            Number(receiverUserWallet.walletBalance) +
            Number(senderWalletTx.txAmount);
        } else {
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
      select: ['endingBalance'],
    });

    return points ? points.endingBalance : 0;
  }

  private async validateLevel(userWallet: UserWallet) {
    //TODO uncomment after merge
    // const points = await this.getTotalPoints(userWallet);
    // const level = this.walletService.calculateLevel(points);
    // if (level < 10) {
    // throw new BadRequestException('Insufficient level');
    // }
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
