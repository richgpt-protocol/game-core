import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import { WalletService } from 'src/wallet/wallet.service';
import { GetProfileDto } from './dtos/get-profile.dto';
import { UpdateUserGameDto } from './dtos/update-user-game.dto';
import { UpdateTaskXpDto } from './dtos/update-task-xp.dto';
import { UpdateUserTelegramDto } from './dtos/update-user-telegram.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { Brackets, DataSource, QueryRunner, Repository } from 'typeorm';
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
import { GetOttDto } from './dtos/get-ott.dto';
import * as crypto from 'crypto';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { TxStatus, UserStatus } from 'src/shared/enum/status.enum';

import { UsdtTx } from './entity/usdt-tx.entity';
import { CreditService } from 'src/wallet/services/credit.service';
import { MPC } from 'src/shared/mpc';
import { Setting } from 'src/setting/entities/setting.entity';
import { SettingEnum } from 'src/shared/enum/setting.enum';
import {
  UsdtTxType,
  WalletTxType,
  PointTxType,
} from 'src/shared/enum/txType.enum';
import { GameService } from 'src/game/game.service';
import { BetService } from 'src/game/bet.service';
import { CampaignService } from 'src/campaign/campaign.service';
import { BetDto } from 'src/game/dto/Bet.dto';
import { WithdrawService } from 'src/wallet/services/withdraw.service';
import { RequestWithdrawDto, SetWithdrawPinDto } from './dtos/withdraw.dto';
import { SquidGameTicketListDto } from './dtos/squid-game.dto';
import { ClaimService } from 'src/wallet/services/claim.service';
import { BetOrder } from 'src/game/entities/bet-order.entity';
import { Game } from 'src/game/entities/game.entity';
import { DrawResult } from 'src/game/entities/draw-result.entity';
import { RedeemTx } from 'src/wallet/entities/redeem-tx.entity';
import { ChatLog } from 'src/chatbot/entities/chatLog.entity';
import { ChatbotService } from 'src/chatbot/chatbot.service';
import { I18nContext } from 'nestjs-i18n';

@Injectable()
export class PublicService {
  private readonly logger = new Logger(PublicService.name);

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
    private gameService: GameService,
    private betService: BetService,
    private campaignService: CampaignService,
    private withdrawService: WithdrawService,
    private claimService: ClaimService,
    private chatbotService: ChatbotService,
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
    const user = await this.userService.findByCriteria('uid', payload.uid);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const userWallet = await this.walletService.getWalletInfo(user.id);
    if (!userWallet) {
      throw new BadRequestException('User wallet not found');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      await queryRunner.startTransaction();

      if (payload.xp > 0) {
        if (payload.taskId !== 8 && payload.taskId !== 9) {
          await this.addXP(
            payload.xp,
            PointTxType.QUEST,
            userWallet,
            null,
            payload.taskId,
            queryRunner,
          );
        }
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
      this.logger.error('Public-service: Failed to update task', error);
      await queryRunner.rollbackTransaction();
      const errorMessage =
        error instanceof BadRequestException ? error.message : 'Error occurred';
      throw new BadRequestException(errorMessage);
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
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
    const user = await this.userService.findByCriteria('uid', payload.uid);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const userWallet = await this.walletService.getWalletInfo(user.id);
    if (!userWallet) {
      throw new BadRequestException('User wallet not found');
    }

    if (payload.usdtAmount > 0.01 || payload.gameUsdAmount > 0.02) {
      throw new BadRequestException('Invalid amount');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const tx = new GameTx();
      tx.usdtAmount = payload.usdtAmount;
      tx.creditAmount = payload.gameUsdAmount;
      tx.xp = payload.xp;
      tx.gameSessionToken = payload.gameSessionToken;
      tx.status = TxStatus.PENDING;
      tx.userWallet = userWallet;
      tx.userWalletId = userWallet.id;
      tx.isNotified =
        payload.gameUsdAmount > 0 || payload.usdtAmount > 0 ? false : true; // Notify only if there is included gameUSD or USDT transfer transaction
      await queryRunner.manager.save(tx);

      if (payload.usdtAmount > 0 && payload.usdtAmount <= 0.01) {
        await this.addUSDT(payload.usdtAmount, userWallet, tx, queryRunner);
      }

      let creditWalletTx;
      if (payload.gameUsdAmount > 0 && payload.gameUsdAmount <= 0.02) {
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
      this.logger.error('Public-service: Failed to update user game', error);
      await queryRunner.rollbackTransaction();
      const errorMessage =
        error instanceof BadRequestException ? error.message : 'Error occurred';
      throw new BadRequestException(errorMessage);
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
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

  async getDrawInfo() {
    const currentGame = await this.gameService.getCurrentGame();

    const previousGameEpoch = Number(currentGame.epoch) - 1;
    const previousDraw = await this.gameService.getDrawResultByEpoch(
      previousGameEpoch.toString(),
    );
    const previousWinningAmount =
      await this.gameService.getTotalWinningAmount();

    return {
      currentGame,
      previousDraw,
      previousWinningAmount,
    };
  }

  async getRecentTransactions() {
    const deposits = await this.walletService.getDepositTransactions(10);
    const withdrawals = await this.walletService.getWithdrawTransactions(10);
    const bets = await this.betService.getRecentBets(10);

    const formattedDeposits = deposits.map((deposit) => {
      return {
        ...deposit,
        uid:
          deposit.uid.slice(0, 3) +
          '****' +
          deposit.uid.slice(deposit.uid.length - 3),
        url:
          this.configService.get('EXPLORER_BASE_URL') + '/tx/' + deposit.txHash,
      };
    });

    const formattedWithdrawals = withdrawals.map((withdrawal) => {
      return {
        ...withdrawal,
        uid:
          withdrawal.uid.slice(0, 3) +
          '****' +
          withdrawal.uid.slice(withdrawal.uid.length - 3),
        url:
          this.configService.get('EXPLORER_BASE_URL') +
          '/tx/' +
          withdrawal.txHash,
      };
    });

    return {
      deposits: formattedDeposits,
      withdrawals: formattedWithdrawals,
      bets,
    };
  }

  async getCampaigbnInfo() {
    return await this.campaignService.findActiveWithBannerCampaigns();
  }

  async bet(uid: string, payload: BetDto[]) {
    const user = await this.userService.findByCriteria('uid', uid);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    await this.betService.bet(user.id, payload);
  }

  async getDepositInfo() {
    if (Number(this.configService.get('BASE_CHAIN_ID')) === 5611) {
      return {
        chains: [
          {
            chainId: 97,
            label: 'BNB Smart Chain',
            logoUri: 'https://storage.googleapis.com/fuyo-assets/BNB.png',
            shortname: 'BNB Testnet',
            tokens: [
              {
                symbol: 'USDT',
                tokenName: 'Tether USD',
                logoUri: 'https://storage.googleapis.com/fuyo-assets/usdt.svg',
                tokenAddress: '0x1e1f230848e2e24e5b728dd445de5de380c7ed41',
              },
            ],
          },
          {
            chainId: 5611,
            label: 'opBNB',
            logoUri: 'https://storage.googleapis.com/fuyo-assets/BNB.png',
            shortname: 'opBNB Testnet',
            tokens: [
              {
                symbol: 'USDT',
                tokenName: 'Tether USD',
                logoUri: 'https://storage.googleapis.com/fuyo-assets/usdt.svg',
                tokenAddress: '0x79dd344db3668816a727a54e21a96c328cad7d01',
              },
            ],
          },
        ],
      };
    } else {
      return {
        chains: [
          {
            chainId: 56,
            label: 'BNB Smart Chain',
            logoUri: 'https://storage.googleapis.com/fuyo-assets/BNB.png',
            shortname: 'BNB Chain',
            tokens: [
              {
                symbol: 'USDT',
                tokenName: 'Tether USD',
                logoUri: 'https://storage.googleapis.com/fuyo-assets/usdt.svg',
                tokenAddress: '0x55d398326f99059ff775485246999027b3197955',
              },
            ],
          },
          {
            chainId: 204,
            label: 'opBNB',
            logoUri: 'https://storage.googleapis.com/fuyo-assets/BNB.png',
            shortname: 'opBNB Chain',
            tokens: [
              {
                symbol: 'USDT',
                tokenName: 'Tether USD',
                logoUri: 'https://storage.googleapis.com/fuyo-assets/usdt.svg',
                tokenAddress: '0x9e5aac1ba1a2e6aed6b32689dfcf62a509ca96f3',
              },
            ],
          },
        ],
      };
    }
  }

  async getUserWalletAddress(uid: string) {
    const user = await this.userService.findByCriteria('uid', uid);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const userWallet = await this.walletService.getWalletInfo(user.id);
    if (!userWallet) {
      throw new BadRequestException('User wallet not found');
    }

    return userWallet.walletAddress;
  }

  async getWithdrawInfo() {
    if (Number(this.configService.get('BASE_CHAIN_ID')) === 5611) {
      return {
        chains: [
          {
            chainId: 97,
            label: 'BNB Smart Chain',
            logoUri: 'https://storage.googleapis.com/fuyo-assets/BNB.png',
            shortname: 'BNB Testnet',
            tokens: [
              {
                symbol: 'USDT',
                tokenName: 'Tether USD',
                logoUri: 'https://storage.googleapis.com/fuyo-assets/usdt.svg',
                tokenAddress: '0x1e1f230848e2e24e5b728dd445de5de380c7ed41',
              },
            ],
          },
        ],
      };
    } else {
      return {
        chains: [
          {
            chainId: 56,
            label: 'BNB Smart Chain',
            logoUri: 'https://storage.googleapis.com/fuyo-assets/BNB.png',
            shortname: 'BNB Chain',
            tokens: [
              {
                symbol: 'USDT',
                tokenName: 'Tether USD',
                logoUri: 'https://storage.googleapis.com/fuyo-assets/usdt.svg',
                tokenAddress: '0x55d398326f99059ff775485246999027b3197955',
              },
            ],
          },
        ],
      };
    }
  }

  async getUserWithdrawableInfo(uid: string, chainId: number) {
    const user = await this.userService.findByCriteria('uid', uid);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const userInfo = await this.userService.getUserInfo(user.id);
    const withdrawFees = await this.withdrawService.getWithdrawalFees(chainId);

    return {
      withdrawableBalance:
        userInfo.withdrawableBalance -
        userInfo.withdrawableBalance * withdrawFees,
      isWithdrawPasswordSet: userInfo.isWithdrawPasswordSet,
    };
  }

  async withdraw(payload: RequestWithdrawDto, i18n: I18nContext) {
    const { uid, ...withdrawPayload } = payload;
    const user = await this.userService.findByCriteria('uid', uid);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    return await this.withdrawService.requestRedeem(
      user.id,
      withdrawPayload,
      i18n,
    );
  }

  async setWithdrawPassword(payload: SetWithdrawPinDto) {
    const user = await this.userService.findByCriteria('uid', payload.uid);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    return await this.userService.updateWithdrawPin(
      user.id,
      payload.withdrawPin,
    );
  }

  async getSquidGameInfo(uid: string) {
    const user = await this.userService.findByCriteria('uid', uid);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const participantInfo = await this.campaignService.getSquidGameParticipant(
      user.id,
    );

    const squidGameInfo = await this.campaignService.getSquidGameData();
    const revivalAmount =
      await this.campaignService.getSquidGameParticipantRevivalData(user.id);

    return {
      participantInfo,
      squidGameInfo,
      revivalAmount: revivalAmount
        ? revivalAmount.amountRequiredToCurrentStage
        : 0,
    };
  }

  async getSquidGameTicketList(payload: SquidGameTicketListDto) {
    const user = await this.userService.findByCriteria('uid', payload.uid);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    return await this.campaignService.getUserSquidGameStage2Ticket(
      user.id,
      payload.page,
      payload.limit,
    );
  }

  async getDepositTaskInfo(uid: string) {
    const user = await this.userService.findByCriteria('uid', uid);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const userWallet = await this.walletService.getWalletInfo(user.id);
    if (!userWallet) {
      throw new BadRequestException('User wallet not found');
    }

    const campaigns = await this.campaignService.findActiveCampaigns();
    const depositWithOne = campaigns.find((campaign) => {
      return campaign.name === 'Deposit $1 USDT Free $1 Credit';
    });
    const depositWithTen = campaigns.find((campaign) => {
      return campaign.name === 'Deposit $10 USDT Free $10 Credit';
    });

    const claimedCredits =
      await this.creditService.findClaimedCreditWithDepositCampaigns(
        userWallet.id,
        [depositWithOne.id, depositWithTen.id],
      );

    const isClaimedWithOne = claimedCredits.find(
      (credit) => credit.campaign.id === depositWithOne.id,
    );
    const isClaimedWithTen = claimedCredits.find(
      (credit) => credit.campaign.id === depositWithTen.id,
    );

    return {
      isClaimedWithOne,
      isClaimedWithTen,
    };
  }

  async claimJackpotRewards(uid: string) {
    const user = await this.userService.findByCriteria('uid', uid);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    return await this.claimService.claimJackpot(user.id);
  }

  async getJackpotTicketList(payload: SquidGameTicketListDto) {
    const user = await this.userService.findByCriteria('uid', payload.uid);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    return await this.walletService.getUserJackpotTicket(
      user.id,
      payload.page,
      payload.limit,
    );
  }

  async getJackpotTickets(payload: SquidGameTicketListDto) {
    const user = await this.userService.findByCriteria('uid', payload.uid);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    return await this.walletService.getUserJackpotTickets(
      user.id,
      payload.page,
      payload.limit,
    );
  }

  async getCurrentJackpot() {
    return await this.gameService.getCurrentJackpot();
  }

  private async addXP(
    xpAmount: number,
    txType: PointTxType,
    userWallet: UserWallet,
    gameTx: GameTx,
    taskId: number,
    queryRunner: QueryRunner,
  ) {
    try {
      const pointTx = new PointTx();
      pointTx.amount = xpAmount;
      pointTx.walletId = userWallet.id;
      pointTx.startingBalance = userWallet.pointBalance;
      pointTx.endingBalance =
        Number(pointTx.startingBalance) + Number(xpAmount);
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
      this.logger.error('Public-service: Failed to add XP', error);
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

      const creditWalletTx = await this.creditService.addCreditQueryRunner(
        {
          amount: creditAmount,
          walletAddress: userWallet.walletAddress,
        },
        queryRunner,
        true,
      );

      gameTx.creditWalletTx = creditWalletTx;
      await queryRunner.manager.save(gameTx);

      return creditWalletTx;
    } catch (error) {
      // await queryRunner.rollbackTransaction();
      this.logger.error('Public-service: Failed to add credit', error);
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
      const miniGameUsdtSender = await queryRunner.manager.findOne(Setting, {
        where: {
          key: SettingEnum.MINI_GAME_USDT_SENDER_ADDRESS,
        },
      });
      if (!miniGameUsdtSender)
        throw new Error('Mini Game USDT Sender not found');
      const usdtTx = new UsdtTx();
      usdtTx.txType = UsdtTxType.GAME_TRANSACTION;
      usdtTx.amount = amount;
      usdtTx.status = TxStatus.PENDING;
      usdtTx.txHash = null;
      usdtTx.retryCount = 0;
      usdtTx.receiverAddress = userWallet.walletAddress;
      usdtTx.senderAddress = miniGameUsdtSender.value;
      usdtTx.chainId = +this.configService.get('BASE_CHAIN_ID');
      usdtTx.gameTx = gameTx;
      await queryRunner.manager.save(usdtTx);
      gameTx.usdtTx = usdtTx;
      await queryRunner.manager.save(gameTx);
    } catch (error) {
      this.logger.error('Public-service: Failed to add GameUSD', error);
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

      const usdtTx = await queryRunner.manager.findOne(UsdtTx, {
        where: {
          status: TxStatus.PENDING,
          txType: UsdtTxType.GAME_TRANSACTION,
        },
      });

      if (!usdtTx) {
        if (!queryRunner.isReleased) await queryRunner.release();

        return;
      }

      if (usdtTx.retryCount >= 3) {
        await queryRunner.manager.update(UsdtTx, usdtTx.id, {
          status: TxStatus.PENDING_DEVELOPER,
        });

        await queryRunner.commitTransaction();

        await this.adminNotificationService.setAdminNotification(
          `Error processing addUSDT. usdtTx: ${usdtTx.id}`,
          'SYNCHRONISE_ADD_USDT',
          'Error processing addUSDT',
          false,
        );
        return;
      }

      let receipt: ContractTransactionReceipt;
      try {
        const provider = new JsonRpcProvider(
          this.configService.get(`PROVIDER_RPC_URL_${usdtTx.chainId}`),
        );
        const signer = new Wallet(
          await MPC.retrievePrivateKey(usdtTx.senderAddress),
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
        this.logger.error('publicService: error Adding gameUSD onchain', error);
        usdtTx.retryCount = usdtTx.retryCount + 1;
        await queryRunner.manager.save(usdtTx);
        await queryRunner.commitTransaction();
        return;
      }

      usdtTx.txHash = receipt.hash;
      usdtTx.status = TxStatus.SUCCESS;
      await queryRunner.manager.save(usdtTx);

      await queryRunner.commitTransaction();
    } catch (error) {
      this.logger.error('error in handleAddGameUSD Cron', error);
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

      if (
        (!gameTxn.creditWalletTx || gameTxn.creditWalletTx.status === 'S') &&
        (gameTxn.usdtAmount == 0 ||
          (gameTxn.walletTx && gameTxn.walletTx.status === 'S'))
      ) {
        gameTxn.status = TxStatus.SUCCESS;
        await queryRunner.manager.save(gameTxn);
        await queryRunner.commitTransaction();
      }
    } catch (error) {
      this.logger.error('publicService: error in statusUpdater Cron', error);
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
                  status: TxStatus.SUCCESS,
                  txType: WalletTxType.DEPOSIT,
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
            creditBalance: Number(creditBalance),
            walletBalance: Number(walletBalance),
          });
          await queryRunner.manager.update(GameTx, gameTxn.id, {
            isNotified: true,
          });
        } catch (error) {
          this.logger.error(
            'error notifing MiniGame Cron',
            error.response.data,
          );
        }
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      this.logger.error('error in notifyMiniGame Cron', error);
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
      release();
    }
  }

  async getUserTicket(
    uid: string,
    isUpcoming: boolean,
    page: number,
    limit: number,
  ) {
    const user = await this.userService.findByCriteria('uid', uid);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const now = new Date(Date.now());
    const currentGame = await this.dataSource.manager
      .createQueryBuilder(Game, 'game')
      .andWhere('game.startDate <= :now', { now })
      .andWhere('game.endDate >= :now', { now })
      .getOne();
    if (!currentGame) {
      throw new BadRequestException('Current epoch not found');
    }

    const betOrders = await this.dataSource.manager
      .createQueryBuilder(BetOrder, 'betOrder')
      .select([
        'betOrder.id',
        'betOrder.numberPair',
        'betOrder.bigForecastAmount',
        'betOrder.smallForecastAmount',
        'betOrder.isClaimed',
        'betOrder.availableClaim',
        'betOrder.createdDate',
        'betOrder.type',
        'betOrder.motherPair',
        'game.epoch',
        'walletTx.status',
        'creditWalletTx.status',
      ])
      .leftJoin('betOrder.game', 'game')
      .leftJoin('betOrder.walletTx', 'walletTx')
      .leftJoin('betOrder.creditWalletTx', 'creditWalletTx')
      .leftJoin('walletTx.userWallet', 'walletTxUserWallet')
      .leftJoin('creditWalletTx.userWallet', 'creditTxUserWallet')
      .leftJoin('creditTxUserWallet.user', 'creditTxUser')
      .where(isUpcoming ? 'game.epoch >= :epoch' : 'game.epoch < :epoch', {
        epoch: Number(currentGame.epoch),
      })
      .andWhere(
        new Brackets((qb) => {
          qb.where('walletTxUserWallet.userId = :userId', {
            userId: user.id,
          }).orWhere('creditTxUser.id = :userId', {
            userId: user.id,
          });
        }),
      )
      .orderBy('betOrder.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return betOrders.map((betOrder) => {
      const {
        bigForecastAmount,
        smallForecastAmount,
        game,
        walletTx,
        creditWalletTx,
        ...rest
      } = betOrder;
      return {
        ...rest,
        bigForecastAmount: Number(bigForecastAmount),
        smallForecastAmount: Number(smallForecastAmount),
        epoch: game.epoch,
        status: walletTx?.status || creditWalletTx.status,
      };
    });
  }

  async getRecentBets(page: number, limit: number) {
    const betOrders = await this.dataSource
      .createQueryBuilder(BetOrder, 'betOrder')
      .select([
        'betOrder.id',
        'betOrder.bigForecastAmount',
        'betOrder.smallForecastAmount',
        'betOrder.createdDate',
        'gameUsdTx.txHash',
        'user.uid',
        'creditUser.uid',
      ])
      .leftJoinAndSelect('betOrder.walletTx', 'walletTx')
      .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
      .leftJoin('userWallet.user', 'user')
      .leftJoinAndSelect('betOrder.creditWalletTx', 'creditWalletTx')
      .leftJoinAndSelect('creditWalletTx.userWallet', 'creditUserWallet')
      .leftJoin('creditUserWallet.user', 'creditUser')
      .leftJoin('betOrder.gameUsdTx', 'gameUsdTx')
      .where(
        new Brackets((qb) => {
          qb.where('walletTx.status = :status', {
            status: TxStatus.SUCCESS,
          }).orWhere('creditWalletTx.status = :status', {
            status: TxStatus.SUCCESS,
          });
        }),
      )
      .orderBy('betOrder.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return betOrders.map((betOrder) => ({
      id: betOrder.id,
      uid:
        betOrder.walletTx?.userWallet.user.uid ||
        betOrder.creditWalletTx.userWallet.user.uid,
      amount:
        Number(betOrder.bigForecastAmount) +
        Number(betOrder.smallForecastAmount),
      time: betOrder.createdDate,
      txUrl:
        this.configService.get(
          `BLOCK_EXPLORER_URL_${this.configService.get('BASE_CHAIN_ID')}`,
        ) + `/tx/${betOrder.gameUsdTx.txHash}`,
    }));
  }

  async getRecentWinningBets(page: number, limit: number) {
    const betOrders = await this.dataSource
      .createQueryBuilder(BetOrder, 'betOrder')
      .select([
        'betOrder.id',
        'betOrder.gameId',
        'betOrder.numberPair',
        'betOrder.bigForecastAmount',
        'betOrder.smallForecastAmount',
        'gameUsdTx.txHash',
        'user.uid',
        'creditUser.uid',
      ])
      .leftJoinAndSelect('betOrder.walletTx', 'walletTx')
      .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
      .leftJoin('userWallet.user', 'user')
      .leftJoinAndSelect('betOrder.creditWalletTx', 'creditWalletTx')
      .leftJoinAndSelect('creditWalletTx.userWallet', 'creditUserWallet')
      .leftJoin('creditUserWallet.user', 'creditUser')
      .leftJoin('betOrder.gameUsdTx', 'gameUsdTx')
      .where(
        new Brackets((qb) => {
          qb.where('walletTx.status = :status', {
            status: TxStatus.SUCCESS,
          }).orWhere('creditWalletTx.status = :status', {
            status: TxStatus.SUCCESS,
          });
        }),
      )
      .andWhere('betOrder.availableClaim = :availableClaim', {
        availableClaim: true,
      })
      .orderBy('betOrder.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    const betOrdersData = [];
    for (const betOrder of betOrders) {
      const drawResult = await this.dataSource
        .createQueryBuilder(DrawResult, 'drawResult')
        .select(['drawResult.id', 'drawResult.prizeCategory', 'game.epoch'])
        .leftJoin('drawResult.game', 'game')
        .where('drawResult.gameId = :gameId', {
          gameId: betOrder.gameId,
        })
        .andWhere('drawResult.numberPair = :numberPair', {
          numberPair: betOrder.numberPair,
        })
        .getOne();
      const { bigForecastWinAmount, smallForecastWinAmount } =
        this.claimService.calculateWinningAmount(betOrder, drawResult);
      betOrdersData.push({
        id: betOrder.id,
        uid:
          betOrder.walletTx?.userWallet.user.uid ||
          betOrder.creditWalletTx?.userWallet.user.uid,
        winningNumberPair: betOrder.numberPair,
        bigForecastBetAmount: Number(betOrder.bigForecastAmount),
        bigForecastWinAmount: bigForecastWinAmount,
        smallForecastBetAmount: Number(betOrder.smallForecastAmount),
        smallForecastWinAmount: smallForecastWinAmount,
        winningEpoch: drawResult.game.epoch,
        txUrl:
          this.configService.get(
            `BLOCK_EXPLORER_URL_${this.configService.get('BASE_CHAIN_ID')}`,
          ) + `/tx/${betOrder.gameUsdTx.txHash}`,
      });
    }

    return betOrdersData;
  }

  async getRecentDeposits(page: number, limit: number) {
    const depositWalletTx = await this.dataSource
      .createQueryBuilder(WalletTx, 'walletTx')
      .select([
        'walletTx.id',
        'walletTx.txAmount',
        'walletTx.createdDate',
        'walletTx.txHash',
        'user.uid',
        'depositTx.chainId',
      ])
      .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
      .leftJoin('userWallet.user', 'user')
      .leftJoin('walletTx.depositTx', 'depositTx')
      .where('walletTx.txType = :txType', {
        txType: WalletTxType.DEPOSIT,
      })
      .andWhere('walletTx.status = :status', {
        status: TxStatus.SUCCESS,
      })
      .orderBy('walletTx.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return depositWalletTx.map((depositWalletTx) => ({
      id: depositWalletTx.id,
      uid: depositWalletTx.userWallet.user.uid,
      amount: Number(depositWalletTx.txAmount),
      time: depositWalletTx.createdDate,
      txUrl:
        this.configService.get(
          `BLOCK_EXPLORER_URL_${depositWalletTx.depositTx.chainId}`,
        ) + `/tx/${depositWalletTx.txHash}`,
    }));
  }

  async getRecentWithdrawals(page: number, limit: number) {
    const withdrawalTxs = await this.dataSource
      .createQueryBuilder(RedeemTx, 'redeemTx')
      .select([
        'redeemTx.id',
        'redeemTx.fromAddress',
        'redeemTx.amount',
        'redeemTx.createdDate',
        'redeemTx.chainId',
        'redeemTx.payoutTxHash',
      ])
      .andWhere('redeemTx.payoutStatus = :payoutStatus', {
        payoutStatus: TxStatus.SUCCESS,
      })
      .orderBy('redeemTx.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    const withdrawalTxData = [];
    for (const withdrawalTx of withdrawalTxs) {
      const userWallet = await this.dataSource
        .createQueryBuilder(UserWallet, 'userWallet')
        .select(['userWallet.walletAddress', 'user.uid'])
        .leftJoinAndSelect('userWallet.user', 'user')
        .where('userWallet.walletAddress = :walletAddress', {
          walletAddress: withdrawalTx.fromAddress,
        })
        .getOne();

      withdrawalTxData.push({
        id: withdrawalTx.id,
        uid: userWallet.user.uid,
        amount: Number(withdrawalTx.amount),
        time: withdrawalTx.createdDate,
        txUrl:
          this.configService.get(`BLOCK_EXPLORER_URL_${withdrawalTx.chainId}`) +
          `/tx/${withdrawalTx.payoutTxHash}`,
      });
    }

    return withdrawalTxData;
  }

  async getDrawResult(epoch: string | null) {
    const gameQuery = await this.dataSource
      .createQueryBuilder(Game, 'game')
      .leftJoinAndSelect('game.drawResult', 'drawResult');

    if (epoch) {
      gameQuery.where('game.epoch = :epoch', { epoch });
    } else {
      const lastHour = new Date(Date.now() - 60 * 60 * 1000);
      gameQuery
        .where('game.startDate < :lastHour', { lastHour })
        .andWhere('game.endDate > :lastHour', { lastHour });
    }

    const game = await gameQuery.getOne();
    if (!game) throw new Error('No game found');

    const now = new Date();
    const isLive = now.getMinutes() >= 0 && now.getMinutes() <= 2;

    return {
      epoch: game.epoch,
      epochStartDate: game.startDate,
      epochEndDate: game.endDate,
      isLive: isLive,
      drawResults: isLive
        ? []
        : game.drawResult.map((drawResult) => {
            return {
              numberPair: drawResult.numberPair,
              prizeCategory: drawResult.prizeCategory,
            };
          }),
    };
  }

  async getDrawResultByNumberPair(
    numberPair: string,
    page: number,
    limit: number,
  ) {
    const drawResults = await this.dataSource
      .createQueryBuilder(DrawResult, 'drawResult')
      .select([
        'drawResult.id',
        'drawResult.numberPair',
        'drawResult.prizeCategory',
        'game.epoch',
        'game.startDate',
        'game.endDate',
      ])
      .leftJoin('drawResult.game', 'game')
      .where('drawResult.numberPair = :numberPair', { numberPair })
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('drawResult.id', 'DESC')
      .getMany();

    return drawResults.map((drawResult) => {
      return {
        id: drawResult.id,
        numberPair: drawResult.numberPair,
        prizeCategory: drawResult.prizeCategory,
        epoch: drawResult.game.epoch,
        epochStartDate: drawResult.game.startDate,
        epochEndDate: drawResult.game.endDate,
      };
    });
  }

  async getChatHistory(uid: string, page: number, limit: number) {
    const user = await this.userService.findByCriteria('uid', uid);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const chatHistory = await this.dataSource
      .createQueryBuilder(ChatLog, 'chatLog')
      .where('chatLog.userId = :userId', { userId: user.id })
      .orderBy('chatLog.createAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return chatHistory.map((chatLog) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { userId, ...rest } = chatLog;
      return {
        ...rest,
      };
    });
  }

  async sendChatMessage(payload: {
    message: string;
    source: string;
    uid: string;
  }) {
    const user = await this.userService.findByCriteria('uid', payload.uid);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const replied = await this.chatbotService.sendMessage(user.id, {
      message: payload.message,
      source: payload.source as 'fuyoapp' | 'telegram' | 'fuyogame',
    });

    return { replied: replied };
  }

  async getClaimableAmount(uid: string) {
    const user = await this.userService.findByCriteria('uid', uid);
    if (!user) throw new Error('User not found');

    const betOrders = await this.dataSource
      .createQueryBuilder(BetOrder, 'betOrder')
      .select([
        'betOrder.gameId',
        'betOrder.numberPair',
        'betOrder.bigForecastAmount',
        'betOrder.smallForecastAmount',
      ])
      .leftJoin('betOrder.walletTx', 'walletTx')
      .leftJoin('walletTx.userWallet', 'userWallet')
      .leftJoin('betOrder.creditWalletTx', 'creditWalletTx')
      .leftJoin('creditWalletTx.userWallet', 'creditUserWallet')
      .where(
        new Brackets((qb) => {
          qb.where('userWallet.userId = :userId', { userId: user.id }).orWhere(
            'creditUserWallet.userId = :userId',
            { userId: user.id },
          );
        }),
      )
      .andWhere(
        new Brackets((qb) => {
          qb.where('walletTx.status = :status', {
            status: TxStatus.SUCCESS,
          }).orWhere('creditWalletTx.status = :status', {
            status: TxStatus.SUCCESS,
          });
        }),
      )
      .andWhere('betOrder.availableClaim = :availableClaim', {
        availableClaim: true,
      })
      .andWhere('betOrder.isClaimed = :isClaimed', {
        isClaimed: false,
      })
      .getMany();

    let claimableAmount = 0;
    for (const betOrder of betOrders) {
      const drawResult = await this.dataSource
        .createQueryBuilder(DrawResult, 'drawResult')
        .select(['drawResult.prizeCategory'])
        .where('drawResult.gameId = :gameId', { gameId: betOrder.gameId })
        .andWhere('drawResult.numberPair = :numberPair', {
          numberPair: betOrder.numberPair,
        })
        .getOne();

      const { bigForecastWinAmount, smallForecastWinAmount } =
        this.claimService.calculateWinningAmount(betOrder, drawResult);
      claimableAmount += bigForecastWinAmount + smallForecastWinAmount;
    }

    return claimableAmount;
  }

  async claim(uid: string) {
    const user = await this.userService.findByCriteria('uid', uid);
    if (!user) throw new Error('User not found');

    return await this.claimService.claim(user.id);
  }

  async getUserLanguage(uid: string): Promise<string | null> {
    const user = await this.userService.findByCriteria('uid', uid);
    if (!user) throw new Error('User not found');

    return await this.userService.getUserLanguage(user.id);
  }

  async updateUserLanguage(uid: string, language: string) {
    const user = await this.userService.findByCriteria('uid', uid);
    if (!user) throw new Error('User not found');

    await this.userService.updateUserLanguage(user.id, language);
  }
}
