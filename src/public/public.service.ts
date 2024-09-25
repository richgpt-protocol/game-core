import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import { WalletService } from 'src/wallet/wallet.service';
import { GetProfileDto } from './dtos/get-profile.dto';
import { UpdateUserGameDto } from './dtos/update-user-game.dto';
import { UpdateTaskXpDto } from './dtos/update-task-xp.dto';
import { UpdateUserTelegramDto } from './dtos/update-user-telegram.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { DataSource, Not, QueryRunner, Repository } from 'typeorm';
import { ConfigService } from 'src/config/config.service';
import {
  ContractTransactionReceipt,
  ethers,
  JsonRpcProvider,
  parseUnits,
  Wallet,
} from 'ethers';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { GameTx } from './entity/gameTx.entity';
import { Mutex } from 'async-mutex';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import axios from 'axios';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PointTxType } from 'src/shared/enum/point-tx.enum';
import { GetOttDto } from './dtos/get-ott.dto';
import * as crypto from 'crypto';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { UserStatus } from 'src/shared/enum/status.enum';

import { UsdtTx } from './entity/usdt-tx.entity';
import { CreditService } from 'src/wallet/services/credit.service';
@Injectable()
export class PublicService {
  GAMEUSD_TRANFER_INITIATOR: string;
  miniGameNotificationEndPoint: string;
  AddCreditMutex: Mutex;
  AddXpMutex: Mutex;
  AddGameUSDMutex: Mutex;
  StatusUpdaterMutex: Mutex;
  CronMutex: Mutex;

  NotifierMutex: Mutex;
  constructor(
    private userService: UserService,
    private walletService: WalletService,
    private configService: ConfigService,
    private creditService: CreditService,
    private dataSource: DataSource,
    @InjectRepository(GameTx)
    private gameTxRespository: Repository<GameTx>,
    private adminNotificationService: AdminNotificationService,
    private eventEmitter: EventEmitter2,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
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
    this.NotifierMutex = new Mutex();
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
        id: payload.tgId,
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

      if (payload.xp > 0) {
        await this.addXP(
          payload.xp,
          PointTxType.QUEST,
          userWallet,
          null,
          payload.taskId,
          queryRunner,
        );
      }

      await queryRunner.commitTransaction();
      const xp = Number(userWallet.pointBalance); // Get the updated XP balance

      return {
        uid: user.uid,
        xp,
        level: this.walletService.calculateLevel(xp),
        xpCap: this.walletService.getCurrentXpCap(xp),
        previousXpCap: this.walletService.getPreviousXpCap(xp),
      };
    } catch (error) {
      console.error('Public-service: Failed to update task', error);
      await queryRunner.rollbackTransaction();
      const errorMessage =
        error instanceof BadRequestException ? error.message : 'Error occurred';
      throw new BadRequestException(errorMessage);
    }
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
        await this.addUSDT(payload.usdtAmount, userWallet, tx, queryRunner);
      }

      let creditWalletTx;
      if (payload.gameUsdAmount > 0) {
        creditWalletTx = await this.addCredit(
          payload.gameUsdAmount,
          userWallet.id,
          tx.id,
          queryRunner,
        );
      }

      if (payload.xp > 0) {
        await this.addXP(
          payload.xp,
          PointTxType.GAME_TRANSACTION,
          userWallet,
          tx,
          null,
          queryRunner,
        );
      }

      const xp = Number(userWallet.pointBalance); // Get the updated XP balance
      await queryRunner.commitTransaction();

      //Should be done after the transaction is committed
      if (payload.gameUsdAmount > 0 && creditWalletTx) {
        await this.creditService.addToQueue(creditWalletTx.id);
      }

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

  async createOtt(payload: GetOttDto) {
    const user = await this.userService.findByCriteria('uid', payload.uid);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('User is not active');
    }

    const ott = crypto.randomBytes(32).toString('hex');
    await this.cacheManager.set(`ott_${user.uid}`, ott, 30000);
    return ott;
  }

  private async addXP(
    xpAmount: number,
    txType: string,
    userWallet: UserWallet,
    gameTx: GameTx,
    taskId: number,
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
      pointTx.txType = txType;

      if (gameTx) {
        pointTx.gameTx = gameTx;
      }

      if (taskId) {
        pointTx.taskId = taskId;
      }

      userWallet.pointBalance = pointTx.endingBalance;
      await queryRunner.manager.save(pointTx);
      await queryRunner.manager.save(userWallet);

      if (gameTx) {
        gameTx.pointTx = pointTx;
        await queryRunner.manager.save(gameTx);
      }
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

      const creditWalletTx = await this.creditService.addCreditMiniGame(
        {
          amount: creditAmount,
          walletAddress: userWallet.walletAddress,
        },
        queryRunner,
      );

      gameTx.creditWalletTx = creditWalletTx;
      await queryRunner.manager.save(gameTx);

      return creditWalletTx;
    } catch (error) {
      // await queryRunner.rollbackTransaction();
      console.error('Public-service: Failed to add credit', error);
      throw new Error(error.message);
    }
  }

  private async addUSDT(
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

      const senderWallet = new Wallet(
        this.configService.get('USDT_SENDER_PRIV_KEY'),
      );

      const usdtTx = new UsdtTx();
      usdtTx.amount = amount;
      usdtTx.status = 'P';
      usdtTx.txHash = null;
      usdtTx.retryCount = 0;
      usdtTx.receiverAddress = userWallet.walletAddress;
      usdtTx.senderAddress = await senderWallet.getAddress();
      usdtTx.chainId = +this.configService.get('BASE_CHAIN_ID');
      usdtTx.walletTx = walletTx;
      usdtTx.walletTxId = walletTx.id;
      walletTx.usdtTx = usdtTx;
      await queryRunner.manager.save(usdtTx);
      await queryRunner.manager.save(walletTx);
    } catch (error) {
      console.error('Public-service: Failed to add GameUSD', error);
      throw new Error(error.message);
    }
  }

  @Cron(CronExpression.EVERY_SECOND)
  async handleAddUSDT() {
    const release = await this.AddGameUSDMutex.acquire();
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const walletTx = await queryRunner.manager
        .createQueryBuilder(WalletTx, 'walletTx')
        .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
        .leftJoinAndSelect('walletTx.usdtTx', 'usdtTx')
        .leftJoinAndSelect('walletTx.gameTx', 'gameTx')
        .where('walletTx.status = :status', { status: 'P' })
        .andWhere('walletTx.txType = :txType', {
          txType: 'GAME_TRANSACTION',
        })
        .getOne();

      // console.log(walletTx);

      if (!walletTx || !walletTx.gameTx) {
        if (!queryRunner.isReleased) await queryRunner.release();

        return;
      }

      const usdtTx = walletTx.usdtTx;
      const userWallet = walletTx.userWallet;

      if (usdtTx.retryCount >= 3) {
        await queryRunner.manager.update(UsdtTx, usdtTx.id, {
          status: 'PD',
        });

        await queryRunner.commitTransaction();

        await this.adminNotificationService.setAdminNotification(
          `Error processing addUSDT. WalletTx: ${walletTx.id}`,
          'SYNCHRONISE_ADD_USDT',
          'Error processing addUSDT',
          false,
        );
        return;
      }

      let receipt: ContractTransactionReceipt;
      try {
        const provider = new JsonRpcProvider(
          this.configService.get(`PROVIDER_URL_${usdtTx.chainId}`),
        );
        const signer = new Wallet(
          this.configService.get('USDT_SENDER_PRIV_KEY'),
          provider,
        );

        this.eventEmitter.emit(
          'gas.service.reload',
          await signer.getAddress(),
          usdtTx.chainId,
        );

        const tokenContract = new ethers.Contract(
          this.configService.get('OPBNB_USDT_TOKEN_ADDRESS'),
          ['function transfer(address to, uint256 amount) returns (bool)'],
          signer,
        );

        const onchainTx = await tokenContract.transfer(
          usdtTx.receiverAddress,
          parseUnits(usdtTx.amount.toString(), 18),
        );
        receipt = await onchainTx.wait(2);

        if (receipt.status != 1) {
          throw new Error('Transaction failed');
        }
      } catch (error) {
        console.error('publicService: error Adding gameUSD onchain', error);
        usdtTx.retryCount = usdtTx.retryCount + 1;
        await queryRunner.manager.save(usdtTx);
        await queryRunner.commitTransaction();
        return;
      }

      usdtTx.txHash = receipt.hash;
      usdtTx.status = 'S';
      await queryRunner.manager.save(usdtTx);

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
      //uses the lastValidWalletTx's endingBalance as starting and ending balance,
      //This is becauses, It will trigger the deposit flow, which will use the starting and ending balance from walletTx table.
      walletTx.endingBalance = Number(lastValidWalletTx?.endingBalance || 0);
      userWallet.walletBalance = walletTx.endingBalance;
      walletTx.txHash = receipt.hash;
      walletTx.status = 'S';
      await queryRunner.manager.save(walletTx);
      await queryRunner.manager.save(userWallet);
      await queryRunner.commitTransaction();
    } catch (error) {
      console.error('error in handleAddGameUSD Cron', error);
      // await this.adminNotificationService.setAdminNotification(
      //   error.message,
      //   'SYNCHRONISE_ADD_GAMEUSD',
      //   'Error processing addGameUSD',
      //   false,
      // );

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

      if (!gameTxn.creditWalletTx || gameTxn.creditWalletTx.status === 'S') {
        //If USDT deposited, waits for the deposit to be successful
        if (gameTxn.walletTx && gameTxn.usdtAmount > 0) {
          const depositWalletTx = await queryRunner.manager.findOne(WalletTx, {
            where: {
              txHash: gameTxn.walletTx.txHash,
              status: 'S',
              txType: 'DEPOSIT',
            },
          });

          if (!depositWalletTx) return;
        }

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
    const release = await this.NotifierMutex.acquire();
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      const gameTxns = await queryRunner.manager
        .createQueryBuilder(GameTx, 'gameTx')
        .leftJoinAndSelect('gameTx.creditWalletTx', 'creditWalletTx')
        .leftJoinAndSelect('gameTx.walletTx', 'walletTx')
        .leftJoinAndSelect('gameTx.userWallet', 'userWallet')
        .where('gameTx.isNotified = :isNotified', { isNotified: false })
        .andWhere('gameTx.status = :status', { status: 'S' })
        .getMany();

      if (gameTxns.length === 0) {
        // console.log('No game transactions found for notification');
        return;
      }

      for (const gameTxn of gameTxns) {
        try {
          // console.log('Notifying mini game', gameTxn.id);
          let walletBalance = 0;
          let creditBalance = 0;
          if (gameTxn.walletTx && gameTxn.usdtAmount > 0) {
            const depositWalletTx = await queryRunner.manager.findOne(
              WalletTx,
              {
                where: {
                  txHash: gameTxn.walletTx.txHash,
                  status: 'S',
                  txType: 'DEPOSIT',
                },
              },
            );

            walletBalance = depositWalletTx?.endingBalance || 0;
          } else {
            walletBalance = gameTxn.userWallet.walletBalance;
          }

          if (gameTxn.creditWalletTx) {
            creditBalance = gameTxn.creditWalletTx.endingBalance;
          } else {
            creditBalance = gameTxn.userWallet.creditBalance;
          }

          await axios.post(this.miniGameNotificationEndPoint, {
            gameSessionToken: gameTxn.gameSessionToken,
            gameUsdAmount: Number(gameTxn.creditAmount),
            usdtAmount: Number(gameTxn.usdtAmount),
            xp: gameTxn.xp,
            creditBalance,
            walletBalance,
          });
          await queryRunner.manager.update(GameTx, gameTxn.id, {
            isNotified: true,
          });
        } catch (error) {
          console.error('error notifing MiniGame Cron', error.response.data);
        }
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      console.error('error in notifyMiniGame Cron', error);
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
      release();
    }
  }
}
