import { BadRequestException, Injectable } from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import { WalletService } from 'src/wallet/wallet.service';
import { GetProfileDto } from './dtos/get-profile.dto';
import { UpdateUserGameDto } from './dtos/update-user-game.dto';
import { UpdateTaskXpDto } from './dtos/update-task-xp.dto';
import { UpdateUserTelegramDto } from './dtos/update-user-telegram.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { CreditWalletTx } from 'src/wallet/entities/credit-wallet-tx.entity';
import { DataSource, Not, QueryRunner, Repository } from 'typeorm';
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';
import { ConfigService } from 'src/config/config.service';
import {
  ContractTransactionReceipt,
  JsonRpcProvider,
  parseUnits,
  Wallet,
} from 'ethers';
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
  AddCreditMutex: Mutex;
  AddXpMutex: Mutex;
  AddGameUSDMutex: Mutex;
  StatusUpdaterMutex: Mutex;
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

    this.AddCreditMutex = new Mutex();
    this.AddXpMutex = new Mutex();
    this.AddGameUSDMutex = new Mutex();
    this.StatusUpdaterMutex = new Mutex();
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
      xpCap: this.walletService.getCurrentXpCap(userWallet.pointBalance),
      previousXpCap: this.walletService.getPreviousXpCap(
        userWallet.pointBalance,
      ),
    };
  }

  async calculateUserLevel(point: number) {
    return this.walletService.calculateLevel(point);
  }

  async updateTaskXP(payload: UpdateTaskXpDto) {
    const user = await this.userService.findByCriteria('uid', payload.uid);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const userWallet = await this.walletService.getWalletInfo(user.id);
    if (!userWallet) {
      throw new BadRequestException('User wallet not found');
    }

    // TODO: Synchronise user points - Seshanth
    const xp = Number(userWallet.pointBalance) + payload.xp;
    return {
      uid: user.uid,
      xp,
      level: this.walletService.calculateLevel(xp),
    };
  }

  async updateUserTelegram(payload: UpdateUserTelegramDto) {
    const user = await this.userService.findByCriteria('uid', payload.uid);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.tgId) {
      return {
        message: 'User already bound the telegram account',
      };
    }

    const existAccount = await this.userService.findByTgId(payload.tgId);
    if (existAccount) {
      throw new BadRequestException(
        'Telegram account already bound to another user',
      );
    }

    await this.userService.update(user.id, {
      tgId: payload.tgId,
      tgUsername: payload.tgUsername,
    });
  }

  async updateUserGame(payload: UpdateUserGameDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      const user = await this.userService.findByCriteria('uid', payload.uid);
      if (!user) {
        throw new BadRequestException('User not found');
      }

      const userWallet = await this.walletService.getWalletInfo(user.id);
      if (!userWallet) {
        throw new BadRequestException('User wallet not found');
      }

      await queryRunner.startTransaction();

      const tx = new GameTx();
      tx.usdtAmount = payload.usdtAmount;
      tx.creditAmount = payload.gameUsdAmount;
      tx.xp = payload.xp;
      tx.gameSessionToken = payload.gameSessionToken;
      tx.status = 'P';
      tx.userWallet = userWallet;
      tx.userWalletId = userWallet.id;
      tx.isNotified =
        payload.gameUsdAmount > 0 || payload.usdtAmount > 0 ? false : true; // Notify only if there is included gameUSD or USDT transfer transaction
      await queryRunner.manager.save(tx);

      if (payload.usdtAmount > 0) {
        await this.addGameUSD(payload.usdtAmount, userWallet, tx, queryRunner);
      }

      if (payload.gameUsdAmount > 0) {
        await this.addCredit(
          payload.gameUsdAmount,
          userWallet.id,
          tx.id,
          queryRunner,
        );
      }

      if (payload.xp > 0) {
        await this.addXP(payload.xp, userWallet, tx, queryRunner);
      }

      await queryRunner.commitTransaction();

      const xp = Number(userWallet.pointBalance); // Get the updated XP balance
      console.log('total xp', xp);
      return {
        uid: user.uid,
        xp,
        level: this.walletService.calculateLevel(xp),
        xpCap: this.walletService.getCurrentXpCap(xp),
        previousXpCap: this.walletService.getPreviousXpCap(xp),
        gameSessionToken: payload.gameSessionToken,
      };
    } catch (error) {
      console.error('Public-service: Failed to update user game', error);
      await queryRunner.rollbackTransaction();
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
      gameUsdTx.amount = creditWalletTx.amount;
      gameUsdTx.status = 'P';
      gameUsdTx.txHash = null;
      gameUsdTx.receiverAddress = creditWalletTx.userWallet.walletAddress;
      gameUsdTx.senderAddress = this.GAMEUSD_TRANFER_INITIATOR;
      gameUsdTx.chainId = +this.configService.get('GAMEUSD_CHAIN_ID');
      gameUsdTx.creditWalletTx = creditWalletTx;
      gameUsdTx.retryCount = 0;

      await queryRunner.manager.save(gameUsdTx);
      creditWalletTx.gameUsdTx = [gameUsdTx];

      await queryRunner.manager.save(creditWalletTx);

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
      walletTx.status = 'P';
      walletTx.userWallet = userWallet;
      walletTx.userWalletId = userWallet.id;
      walletTx.gameTx = gameTx;
      await queryRunner.manager.save(walletTx);

      gameTx.walletTx = walletTx;
      await queryRunner.manager.save(gameTx);

      const gameUsdTx = new GameUsdTx();
      gameUsdTx.amount = amount;
      gameUsdTx.status = 'P';
      gameUsdTx.txHash = null;
      gameUsdTx.retryCount = 0;
      gameUsdTx.receiverAddress = userWallet.walletAddress;
      gameUsdTx.senderAddress = this.GAMEUSD_TRANFER_INITIATOR;
      gameUsdTx.chainId = +this.configService.get('GAMEUSD_CHAIN_ID');
      gameUsdTx.walletTxs = [walletTx];
      gameUsdTx.walletTxId = walletTx.id;
      await queryRunner.manager.save(gameUsdTx);
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
  async handleAddCreditTransactions() {
    const release = await this.AddCreditMutex.acquire();
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const creditWalletTxn = await queryRunner.manager
        .createQueryBuilder(CreditWalletTx, 'creditWalletTx')
        .leftJoinAndSelect('creditWalletTx.gameTx', 'gameTx')
        .leftJoinAndSelect('creditWalletTx.gameUsdTx', 'gameUsdTx')
        .leftJoinAndSelect('creditWalletTx.userWallet', 'userWallet')
        .where('creditWalletTx.status = :status', { status: 'P' })
        .andWhere('gameUsdTx.status = :status', { status: 'P' })
        .andWhere('creditWalletTx.txType = :txType', {
          txType: 'GAME_TRANSACTION',
        })
        .getOne();

      if (!creditWalletTxn) {
        // console.log('No credit transactions found');
        if (!queryRunner.isReleased) await queryRunner.release();

        return;
      }

      const gameUsdTx = creditWalletTxn.gameUsdTx[0];

      if (gameUsdTx.retryCount >= 3) {
        await queryRunner.manager.update(GameUsdTx, gameUsdTx.id, {
          status: 'PD',
        });

        await queryRunner.commitTransaction();
        return;
      }

      let receipt: ContractTransactionReceipt;
      try {
        const signer = await this.getSigner(
          gameUsdTx.chainId,
          gameUsdTx.senderAddress,
        );
        const onchainTx = await this.depositGameUSD(
          gameUsdTx.receiverAddress,
          parseUnits(gameUsdTx.amount.toString(), 18),
          signer,
        );

        receipt = await onchainTx.wait(2);

        if (receipt && receipt.status != 1) {
          creditWalletTxn.gameTx.retryCount =
            creditWalletTxn.gameTx.retryCount + 1;
          gameUsdTx.retryCount = gameUsdTx.retryCount + 1;

          throw new Error('Transaction failed');
        }
      } catch (error) {
        console.error('error in handleAddCreditTransactions Cron', error);
        gameUsdTx.retryCount = gameUsdTx.retryCount + 1;
        await queryRunner.manager.save(gameUsdTx);
        await queryRunner.manager.save(creditWalletTxn);
        await queryRunner.commitTransaction();

        return;
      }

      gameUsdTx.txHash = receipt.hash;
      gameUsdTx.status = 'S';
      creditWalletTxn.status = 'S';

      const lastValidCreditWalletTx = await queryRunner.manager.findOne(
        CreditWalletTx,
        {
          where: {
            userWallet: creditWalletTxn.userWallet,
            status: 'S',
            id: Not(creditWalletTxn.id),
          },
          order: {
            updatedDate: 'DESC',
          },
        },
      );
      creditWalletTxn.startingBalance =
        lastValidCreditWalletTx?.endingBalance || 0;
      const endingBalance =
        Number(lastValidCreditWalletTx?.endingBalance || 0) +
        Number(gameUsdTx.amount);
      creditWalletTxn.endingBalance = endingBalance;
      creditWalletTxn.userWallet.creditBalance = endingBalance;

      await queryRunner.manager.save(gameUsdTx);
      await queryRunner.manager.save(creditWalletTxn);
      await queryRunner.manager.save(creditWalletTxn.userWallet);
      await queryRunner.commitTransaction();
    } catch (error) {
      console.error('error processing addCredit', error);
      await queryRunner.rollbackTransaction();

      await this.adminNotificationService.setAdminNotification(
        error.message,
        'SYNCHRONISE_ADD_CREDIT',
        'Error processing addCredit',
        false,
      );
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
      release();
    }
  }

  @Cron(CronExpression.EVERY_SECOND)
  async handleAddGameUSD() {
    const release = await this.AddGameUSDMutex.acquire();
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const gameTx = await queryRunner.manager
        .createQueryBuilder(GameTx, 'gameTx')
        .leftJoinAndSelect('gameTx.walletTx', 'walletTx')
        .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
        .leftJoinAndSelect('walletTx.gameUsdTx', 'gameUsdTx')
        .where('gameUsdTx.status = :status', { status: 'P' })
        .andWhere('walletTx.status = :status', { status: 'P' })
        .getOne();

      if (!gameTx) {
        if (!queryRunner.isReleased) await queryRunner.release();

        return;
      }

      const walletTx = gameTx.walletTx;
      const gameUsdTx = walletTx.gameUsdTx;
      const userWallet = walletTx.userWallet;

      if (gameUsdTx.retryCount >= 3) {
        await queryRunner.manager.update(GameUsdTx, gameUsdTx.id, {
          status: 'PD',
        });

        await queryRunner.commitTransaction();
        return;
      }

      let receipt: ContractTransactionReceipt;
      try {
        const signer = await this.getSigner(
          gameUsdTx.chainId,
          gameUsdTx.senderAddress,
        );

        const onchainTx = await this.depositGameUSD(
          gameUsdTx.receiverAddress,
          parseUnits(gameUsdTx.amount.toString(), 18),
          signer,
        );
        receipt = await onchainTx.wait(2);

        if (receipt.status != 1) {
          throw new Error('Transaction failed');
        }
      } catch (error) {
        console.error('publicService: error Adding gameUSD onchain', error);
        gameUsdTx.retryCount = gameUsdTx.retryCount + 1;
        await queryRunner.manager.save(gameUsdTx);
        await queryRunner.commitTransaction();
        return;
      }

      gameUsdTx.txHash = receipt.hash;
      gameUsdTx.status = 'S';
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
        Number(lastValidWalletTx?.endingBalance || 0) +
        Number(gameUsdTx.amount);
      userWallet.walletBalance = walletTx.endingBalance;
      walletTx.status = 'S';
      await queryRunner.manager.save(walletTx);
      await queryRunner.manager.save(userWallet);
      await queryRunner.commitTransaction();
    } catch (error) {
      console.error('error in handleAddGameUSD Cron', error);
      await this.adminNotificationService.setAdminNotification(
        error.message,
        'SYNCHRONISE_ADD_GAMEUSD',
        'Error processing addGameUSD',
        false,
      );

      await queryRunner.rollbackTransaction();
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
      release();
    }
  }

  //Updates the status of gameTx to success if all the transactions are successful
  @Cron(CronExpression.EVERY_SECOND)
  async statusUpdater() {
    const release = await this.StatusUpdaterMutex.acquire();
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const gameTxn = await queryRunner.manager
        .createQueryBuilder(GameTx, 'gameTx')
        .leftJoinAndSelect('gameTx.userWallet', 'userWallet')
        .leftJoinAndSelect('gameTx.pointTx', 'pointTx')
        .leftJoinAndSelect('gameTx.creditWalletTx', 'creditWalletTx')
        .leftJoinAndSelect('gameTx.walletTx', 'walletTx')
        .where('gameTx.status = :status', { status: 'P' })
        .getOne();

      if (!gameTxn) {
        if (!queryRunner.isReleased) await queryRunner.release();
        return;
      }

      console.log('publicService: Updating status for gameTx', gameTxn.id);

      if (
        (!gameTxn.creditWalletTx || gameTxn.creditWalletTx.status === 'S') &&
        (!gameTxn.walletTx || gameTxn.walletTx.status === 'S')
      ) {
        gameTxn.status = 'S';
        await queryRunner.manager.save(gameTxn);
      }
      await queryRunner.commitTransaction();
    } catch (error) {
      console.error('publicService: error in statusUpdater Cron', error);
      await this.adminNotificationService.setAdminNotification(
        error.message,
        'SYNCHRONISE_SET_STATUS',
        `Error Setting the status to success`,
        false,
      );
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
      release();
    }
  }

  @Cron(CronExpression.EVERY_SECOND)
  async notifyMiniGame() {
    try {
      const gameTxns = await this.dataSource.manager.find(GameTx, {
        where: {
          isNotified: false,
          status: 'S',
        },
        relations: ['walletTx', 'creditWalletTx'],
      });

      if (gameTxns.length === 0) {
        // console.log('No game transactions found for notification');
        return;
      }

      for (const gameTxn of gameTxns) {
        try {
          // console.log('Notifying mini game', gameTxn.id);
          await axios.post(this.miniGameNotificationEndPoint, {
            gameSessionToken: gameTxn.gameSessionToken,
            gameUsdAmount: Number(gameTxn.creditAmount),
            usdtAmount: Number(gameTxn.usdtAmount),
            xp: gameTxn.xp,
            creditBalance: Number(gameTxn.creditWalletTx?.endingBalance) || 0,
            walletBalance: Number(gameTxn.walletTx?.endingBalance) || 0,
          });
          await this.dataSource.manager.update(GameTx, gameTxn.id, {
            isNotified: true,
          });
        } catch (error) {
          console.error('error notifing MiniGame Cron', error.response.data);
        }
      }
    } catch (error) {
      console.error('error in notifyMiniGame Cron', error);
    }
  }
}
