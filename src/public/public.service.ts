import { BadRequestException, Injectable } from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import { WalletService } from 'src/wallet/wallet.service';
import { GetProfileDto } from './dtos/get-profile.dto';
import { UpdateUserGameDto } from './dtos/update-user-game.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { CreditWalletTx } from 'src/wallet/entities/credit-wallet-tx.entity';
import { DataSource, Not, QueryRunner, Repository } from 'typeorm';
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';
import { ConfigService } from 'src/config/config.service';
import { JsonRpcProvider, parseUnits, Wallet } from 'ethers';
import { Deposit__factory } from 'src/contract';
import { MPC } from 'src/shared/mpc';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { GameTx } from './entity/gameTx.entity';
import { Mutex } from 'async-mutex';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import axios from 'axios';

@Injectable()
export class PublicService {
  GAMEUSD_TRANFER_INITIATOR: string;
  miniGameNotificationEndPoint: string;

  CronMutex: Mutex;
  constructor(
    private userService: UserService,
    private walletService: WalletService,
    private configService: ConfigService,
    private dataSource: DataSource,
    @InjectRepository(GameTx)
    private gameTxRespository: Repository<GameTx>,
    private adminNotificationService: AdminNotificationService,
  ) {
    this.GAMEUSD_TRANFER_INITIATOR = this.configService.get(
      'DEPOSIT_BOT_ADDRESS',
    );
    this.miniGameNotificationEndPoint = this.configService.get(
      'MINI_GAME_NOTIFICATION_ENDPOINT',
    );

    if (
      !this.miniGameNotificationEndPoint ||
      this.miniGameNotificationEndPoint == ''
    ) {
      throw new Error('MINI_GAME_NOTIFICATION_ENDPOINT is not set');
    }

    this.CronMutex = new Mutex();
  }

  async findUser(payload: GetProfileDto) {
    let field = '';
    let value: any;

    if (payload.tgId) {
      field = 'tgId';
      value = payload.tgId;
    } else if (payload.uid) {
      field = 'uid';
      value = payload.uid;
    }

    let user = await this.userService.findByCriteria(field, value);
    if (!user) {
      if (field === 'uid') {
        return null;
      }

      // Create user if tgId not found
      const existUser = await this.userService.signInWithTelegram({
        auth_date: 0,
        first_name: payload.firstName,
        id: Number(payload.tgId),
        hash: '',
        photo_url: payload.photoUrl,
        username: payload.username,
        referralCode: payload.referralCode,
      });

      if (existUser && existUser.data) {
        user = existUser.data;
      }
    }

    const userWallet = await this.walletService.getWalletInfo(user.id);
    if (!userWallet) {
      return null;
    }

    return {
      uid: user.uid,
      tgId: user.tgId,
      xp: userWallet.pointBalance,
      walletBalance: userWallet.walletBalance,
      creditBalance: userWallet.creditBalance,
      userLevel: this.walletService.calculateLevel(userWallet.pointBalance),
      referralCode: user.referralCode, // Share the referral code across the apps
    };
  }

  async calculateUserLevel(point: number) {
    return this.walletService.calculateLevel(point);
  }

  async updateUserGame(payload: UpdateUserGameDto) {
    try {
      const user = await this.userService.findByCriteria('uid', payload.uid);
      if (!user) {
        throw new BadRequestException('User not found');
      }

      const userWallet = await this.walletService.getWalletInfo(user.id);
      if (!userWallet) {
        throw new BadRequestException('User wallet not found');
      }

      const tx = await this.gameTxRespository.create({
        usdtAmount: payload.usdtAmount,
        creditAmount: payload.gameUsdAmount,
        xp: payload.xp,
        gameSessionToken: payload.gameSessionToken,
        status: 'P',
        userWalletId: userWallet.id,
      });

      await this.gameTxRespository.save(tx);

      const xp = Number(userWallet.pointBalance) + payload.xp;
      return {
        uid: user.uid,
        xp,
        level: this.walletService.calculateLevel(xp),
        gameSessionToken: payload.gameSessionToken,
      };
    } catch (error) {
      console.error('Public-service: Failed to update user game', error);
      const errorMessage =
        error instanceof BadRequestException ? error.message : 'Error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  private async addXP(
    xpAmount: number,
    userWallet: UserWallet,
    gameTx: GameTx,
    queryRunner: QueryRunner,
  ) {
    try {
      const lastValidPointTx = await this.dataSource.manager.findOne(PointTx, {
        where: {
          walletId: userWallet.id,
        },
        order: {
          updatedDate: 'DESC',
        },
      });

      const pointTx = new PointTx();
      pointTx.amount = xpAmount;
      pointTx.walletId = userWallet.id;
      pointTx.startingBalance = lastValidPointTx?.endingBalance || 0;
      pointTx.endingBalance =
        Number(lastValidPointTx?.endingBalance || 0) + Number(xpAmount);
      pointTx.userWallet = userWallet;
      pointTx.txType = 'GAME_TRANSACTION';
      pointTx.gameTx = gameTx;
      userWallet.pointBalance = pointTx.endingBalance;
      await queryRunner.manager.save(pointTx);
      await queryRunner.manager.save(userWallet);

      gameTx.pointTx = pointTx;
      await queryRunner.manager.save(gameTx);
    } catch (error) {
      console.error('Public-service: Failed to add XP', error);
      throw new Error(error.message);
    }
  }

  private async addCredit(
    creditAmount: number,
    userWalletId: number,
    gameTxId: number,
    queryRunner: QueryRunner,
  ) {
    // const queryRunner = this.dataSource.createQueryRunner();

    try {
      // await queryRunner.connect();
      // await queryRunner.startTransaction();
      const gameTx = await queryRunner.manager.findOne(GameTx, {
        where: {
          id: gameTxId,
        },
      });
      const userWallet = await queryRunner.manager.findOne(UserWallet, {
        where: {
          id: userWalletId,
        },
      });

      const today = new Date();
      const expirationDate = new Date(today.setDate(today.getDate() + 60));
      const creditWalletTx = new CreditWalletTx();
      creditWalletTx.amount = creditAmount;
      creditWalletTx.txType = 'GAME_TRANSACTION';
      creditWalletTx.status = 'P';
      creditWalletTx.walletId = userWallet.id;
      creditWalletTx.userWallet = userWallet;
      creditWalletTx.expirationDate = expirationDate;
      creditWalletTx.gameTx = gameTx;
      await queryRunner.manager.save(creditWalletTx);

      gameTx.creditWalletTx = creditWalletTx;
      await queryRunner.manager.save(gameTx);

      const gameUsdTx = new GameUsdTx();
      gameUsdTx.amount = creditAmount;
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
      gameUsdTx.creditWalletTx.status = 'S';

      const lastValidCreditWalletTx = await queryRunner.manager.findOne(
        CreditWalletTx,
        {
          where: {
            userWallet: gameUsdTx.creditWalletTx.userWallet,
            status: 'S',
            id: Not(gameUsdTx.creditWalletTx.id),
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

      // await queryRunner.commitTransaction();
    } catch (error) {
      // await queryRunner.rollbackTransaction();
      console.error('Public-service: Failed to add credit', error);
      throw new Error(error.message);
    }
  }

  private async addGameUSD(
    amount: number,
    userWallet: UserWallet,
    gameTx: GameTx,
    queryRunner: QueryRunner,
  ) {
    try {
      const walletTx = new WalletTx();
      walletTx.txType = 'GAME_TRANSACTION';
      walletTx.txAmount = amount;
      walletTx.txHash = '';
      walletTx.status = 'S';
      walletTx.userWallet = userWallet;
      walletTx.userWalletId = userWallet.id;
      walletTx.gameTx = gameTx;
      await queryRunner.manager.save(walletTx);

      gameTx.walletTx = walletTx;
      await queryRunner.manager.save(gameTx);

      const gameUsdTx = new GameUsdTx();
      gameUsdTx.amount = amount;
      gameUsdTx.status = 'S';
      gameUsdTx.txHash = null;
      gameUsdTx.retryCount = 0;
      gameUsdTx.receiverAddress = userWallet.walletAddress;
      gameUsdTx.senderAddress = this.GAMEUSD_TRANFER_INITIATOR;
      gameUsdTx.chainId = +this.configService.get('GAMEUSD_CHAIN_ID');
      gameUsdTx.walletTxs = [walletTx];
      gameUsdTx.walletTxId = walletTx.id;
      await queryRunner.manager.save(gameUsdTx);

      const signer = await this.getSigner(
        gameUsdTx.chainId,
        gameUsdTx.senderAddress,
      );

      const onchainTx = await this.depositGameUSD(
        gameUsdTx.receiverAddress,
        parseUnits(gameUsdTx.amount.toString(), 18),
        signer,
      );
      await onchainTx.wait(2);
      gameUsdTx.txHash = onchainTx.hash;
      await queryRunner.manager.save(gameUsdTx);

      const lastValidWalletTx = await queryRunner.manager.findOne(WalletTx, {
        where: {
          userWalletId: userWallet.id,
          status: 'S',
          id: Not(walletTx.id),
        },
        order: {
          updatedDate: 'DESC',
        },
      });
      walletTx.startingBalance = lastValidWalletTx?.endingBalance || 0;
      walletTx.endingBalance =
        Number(lastValidWalletTx?.endingBalance || 0) + Number(amount);
      userWallet.walletBalance = walletTx.endingBalance;
      await queryRunner.manager.save(walletTx);
      await queryRunner.manager.save(userWallet);
    } catch (error) {
      console.error('Public-service: Failed to add GameUSD', error);
      throw new Error(error.message);
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

  @Cron(CronExpression.EVERY_SECOND)
  async handleGameTransactions() {
    const release = await this.CronMutex.acquire();
    try {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      const gameTxn = await queryRunner.manager.findOne(GameTx, {
        where: {
          status: 'P',
        },
        order: {
          createdDate: 'ASC',
        },
        // relations: ['userWallet', 'pointTx', 'creditWalletTx', 'walletTx'],
      });

      if (!gameTxn) {
        // console.log('No game transactions found');
        if (!queryRunner.isReleased) await queryRunner.release();

        return;
      }
      try {
        console.log('Processing game transaction', gameTxn.id);
        if (gameTxn.status === 'S') {
          console.log('Game transaction already processed', gameTxn.id);
          if (!queryRunner.isReleased) await queryRunner.release();

          return;
        }

        const userWallet = await queryRunner.manager.findOne(UserWallet, {
          where: {
            id: gameTxn.userWalletId,
          },
        });

        if (gameTxn.creditAmount > 0) {
          await this.addCredit(
            gameTxn.creditAmount,
            userWallet.id,
            gameTxn.id,
            queryRunner,
          );
        }

        if (gameTxn.usdtAmount > 0) {
          await this.addGameUSD(
            gameTxn.usdtAmount,
            userWallet,
            gameTxn,
            queryRunner,
          );
        }

        if (gameTxn.xp > 0) {
          await this.addXP(gameTxn.xp, userWallet, gameTxn, queryRunner);
        }

        gameTxn.status = 'S';
        await queryRunner.manager.save(gameTxn);
        // throw new Error('Test Error');

        await queryRunner.commitTransaction();
      } catch (error) {
        console.error('error in handleGameTransactions Cron', error);
        const id = gameTxn.id;
        const retryCount = gameTxn.retryCount || 0;

        console.log(`retryCount: ${retryCount}`);

        await queryRunner.rollbackTransaction();

        if (retryCount >= 3) {
          await this.dataSource.manager.update(GameTx, id, {
            status: 'PD',
          });

          await this.adminNotificationService.setAdminNotification(
            `Failed to process game transaction: ID - ${id}`,
            'GAME_TRANSACTION',
            'GAME_TRANSACTION_FAILED',
            false,
          );
        } else {
          console.log('updating retry count');
          await this.dataSource.manager.update(GameTx, id, {
            retryCount: retryCount + 1,
          });
        }
      } finally {
        if (!queryRunner.isReleased) await queryRunner.release();
      }
    } catch (error) {
      console.error('error in handleGameTransactions Cron', error);
    } finally {
      release();
    }
  }

  @Cron(CronExpression.EVERY_SECOND)
  async notifyMiniGame() {
    try {
      const gameTxns = await this.dataSource.manager.find(GameTx, {
        where: {
          isNotified: false,
        },
      });

      if (gameTxns.length === 0) {
        // console.log('No game transactions found for notification');
        return;
      }

      for (const gameTxn of gameTxns) {
        try {
          await this.dataSource.manager.update(GameTx, gameTxn.id, {
            isNotified: true,
          });

          await axios.post(this.miniGameNotificationEndPoint, {
            gameSessionToken: gameTxn.gameSessionToken,
            gameUsdAmount: gameTxn.creditAmount,
            usdtAmount: gameTxn.usdtAmount,
            xp: gameTxn.xp,
            creditBalance: gameTxn.creditWalletTx?.endingBalance || 0,
            walletBalance: gameTxn.walletTx?.endingBalance || 0,
          });
        } catch (error) {}
      }
    } catch (error) {
      console.error('error in notifyMiniGame Cron', error);
    }
  }
}
