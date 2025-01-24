import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, QueryRunner, Repository } from 'typeorm';
import { UserWallet } from './entities/user-wallet.entity';
import { WalletTx } from './entities/wallet-tx.entity';
import { User } from 'src/user/entities/user.entity';
import { SettingEnum } from 'src/shared/enum/setting.enum';
import { Setting } from 'src/setting/entities/setting.entity';
import { UsdtTx } from 'src/public/entity/usdt-tx.entity';
import { ConfigService } from 'src/config/config.service';
import { GameUsdTx } from './entities/game-usd-tx.entity';
import { TxStatus } from 'src/shared/enum/status.enum';
import { UsdtTxType, WalletTxType } from 'src/shared/enum/txType.enum';
import * as dotenv from 'dotenv';
import { BetOrder } from 'src/game/entities/bet-order.entity';
import { JackpotTx } from 'src/game/entities/jackpot-tx.entity';
dotenv.config();

type TransactionHistory = {
  txType: string;
  txAmount: number;
  createdDate: Date;
  status: string;
};

@Injectable()
export class WalletService {
  levelMap = [];
  constructor(
    @InjectRepository(UserWallet)
    private userWalletRepository: Repository<UserWallet>,
    @InjectRepository(WalletTx)
    private walletTxRepository: Repository<WalletTx>,
    @InjectRepository(GameUsdTx)
    private gameUsdTxRepository: Repository<GameUsdTx>,
    private datasource: DataSource,
    private configService: ConfigService,
    @InjectRepository(JackpotTx)
    private jackpotTxRepository: Repository<JackpotTx>,
  ) {
    for (let i = 1; i <= 100; i++) {
      // const xp = Math.floor(50 * Math.pow(i, 3) + 1000 * Math.exp(0.1 * i));
      const xp = 50 * Math.pow(i, 3) + 1000 * Math.exp(0.1 * i);
      const prev = this.levelMap.length > 0 ? this.levelMap[i - 2].xp : 0;
      this.levelMap.push({ xp: xp + prev, level: i });
    }
  }

  async getWalletInfo(id: number) {
    const walletInfo = await this.userWalletRepository
      .createQueryBuilder('wallet')
      .where({ userId: id })
      .getOne();
    return walletInfo;
  }

  private _calculateLevel(point: number): number {
    // minimum level 1
    const level1 = this.levelMap.find((level) => level.level === 1);
    if (point < level1.xp) return 1;

    const levels = this.levelMap
      .sort((a, b) => a.xp - b.xp)
      .filter((level) => level.xp <= point);
    const highestLevel = levels[levels.length - 1].level + 1;
    // console.log(this.levelMap)
    // [
    //   { xp: 1155.1709180756477, level: 1 },
    //   { xp: 2776.5736762358174, level: 2 },
    //   { xp: 5476.432483811821, level: 3 },
    //   ...
    // ]
    // All the new user is level 1 at the beginning.
    // if xp > 1155.17, level 2.
    // if xp > 2776.57, level 3.
    // ...and so on
    // get the highest level based on xp
    // i.e. XP = 1000, level = 1
    // i.e. XP = 2000, level = 2
    // i.e. XP = 3000, level = 3
    // i.e. XP = 4000, level = 3
    // i.e. XP = 5000, level = 3
    // i.e. XP = 6000, level = 4
    // refer https://daoventuresco.slack.com/archives/C02AUMV9C3S/p1729164331651769?thread_ts=1728281319.679679&cid=C02AUMV9C3S
    return highestLevel;
  }

  calculateLevel(point: number): number {
    return this._calculateLevel(point);
  }

  calculateLevelAndPercentage(point: number): {
    level: number;
    percentage: number;
  } {
    const highestLevel = this._calculateLevel(point);
    // highestLevel is the current level

    // Find the next and previous level
    const previousLevel = this.levelMap.find(
      (level) => level.level === highestLevel - 1,
    );
    const currentLevel = this.levelMap.find(
      (level) => level.level === highestLevel,
    );

    // Calculate the percentage towards the next level
    // refer _calculateLevel() for how to define "next level" based on levelMap
    const xpSincePreviousLevel = point - (previousLevel ? previousLevel.xp : 0);
    const xpNeededFromPreviousLevelToNextLeven =
      currentLevel.xp - (previousLevel ? previousLevel.xp : 0);
    const percentage = Math.floor(
      (xpSincePreviousLevel / xpNeededFromPreviousLevelToNextLeven) * 100,
    );

    return { level: highestLevel, percentage };
  }

  getCurrentXpCap(point: number): number {
    return this.levelMap
      .sort((a, b) => a.xp - b.xp)
      .find((level) => level.xp > point).xp;
  }

  getPreviousXpCap(point: number): number {
    const levelData = this.levelMap
      .sort((a, b) => a.xp - b.xp)
      .find((level) => level.xp > point);

    return levelData.level === 1 ? 0 : this.levelMap[levelData.level - 2].xp;
  }

  async getWalletTx(
    userId: number,
    count: number,
  ): Promise<Array<TransactionHistory>> {
    const wallet = await this.userWalletRepository.findOne({
      where: { userId },
    });

    const gameTxnsDb = await this.gameUsdTxRepository
      .createQueryBuilder('gameUsdTx')
      .leftJoinAndSelect('gameUsdTx.walletTxs', 'walletTxs')
      .leftJoinAndSelect('gameUsdTx.creditWalletTx', 'creditWalletTx')
      .where('gameUsdTx.status = :status', { status: TxStatus.SUCCESS })
      .andWhere(
        new Brackets((qb) => {
          qb.where(
            'walletTxs.userWalletId = :userWalletId AND walletTxs.txType != :txType',
            {
              userWalletId: wallet.id,
              txType: 'GAME_TRANSACTION',
            },
          ).orWhere('creditWalletTx.walletId = :walletId', {
            walletId: wallet.id,
          });
        }),
      )
      .orderBy('gameUsdTx.id', 'DESC')
      .limit(count)
      .getMany();

    const allTxs = gameTxnsDb.map((gameUsdTx) => {
      let amount = 0;

      if (gameUsdTx.walletTxs.length > 0) {
        // amount = gameUsdTx.walletTxs[0].txAmount;
        amount = gameUsdTx.walletTxs.reduce(
          (acc, curr) => acc + Number(curr.txAmount),
          0,
        );
      }

      if (gameUsdTx.creditWalletTx.length > 0) {
        const creditAmount = gameUsdTx.creditWalletTx.reduce((acc, curr) => {
          return acc + Number(curr.amount);
        }, 0);
        amount = Number(amount) + Number(creditAmount);
      }

      let startingBalance = 0;
      let endingBalance = 0;
      if (
        gameUsdTx.walletTxs.length > 0 &&
        gameUsdTx.walletTxs[0].txType === 'INTERNAL_TRANSFER'
      ) {
        startingBalance = gameUsdTx.walletTxs[0].startingBalance;
        endingBalance = gameUsdTx.walletTxs[0].endingBalance;
      }

      return {
        txType: gameUsdTx.creditWalletTx[0]
          ? gameUsdTx.creditWalletTx[0].txType
          : gameUsdTx.walletTxs[0].txType,
        txAmount: amount,
        createdDate: gameUsdTx.walletTxs[0]
          ? gameUsdTx.walletTxs[0].createdDate
          : gameUsdTx.creditWalletTx[0].createdDate,
        status: gameUsdTx.status,
        startingBalance,
        endingBalance,
      };
    });

    return allTxs;
  }

  async getBetOrders(userId: number) {
    try {
      const betOrders = await this.datasource.manager
        .createQueryBuilder(BetOrder, 'betOrder')
        .innerJoinAndSelect('betOrder.gameUsdTx', 'gameUsdTx')
        .leftJoinAndSelect('betOrder.game', 'game')
        .leftJoinAndSelect('game.drawResult', 'drawResult')
        .leftJoinAndSelect('betOrder.walletTx', 'walletTx')
        .leftJoinAndSelect('betOrder.creditWalletTx', 'creditWalletTx')
        .leftJoinAndSelect('walletTx.userWallet', 'walletTxUserWallet')
        .leftJoinAndSelect('creditWalletTx.userWallet', 'creditTxUserWallet')
        .leftJoinAndSelect('walletTxUserWallet.user', 'walletTxUser')
        .leftJoinAndSelect('creditTxUserWallet.user', 'creditTxUser')
        .where('walletTxUserWallet.userId = :userId', { userId })
        .orWhere('creditTxUser.id = :userId', { userId })
        .andWhere('gameUsdTx.status = :status', { status: 'S' })
        .orderBy('betOrder.id', 'DESC')
        .getMany();

      const groupedBetOrders = betOrders.reduce((acc, betOrder) => {
        const gameUsdTxId = betOrder.gameUsdTx.id;
        if (!acc[gameUsdTxId]) {
          acc[gameUsdTxId] = [];
        }
        acc[gameUsdTxId].push(betOrder);
        return acc;
      }, {});

      return groupedBetOrders;
    } catch (error) {
      console.error(error);

      return [];
    }
  }

  async getPointHistory(userId: number, count: number) {
    const userWallet = await this.userWalletRepository.findOne({
      where: { userId },
      // todo: use sql query to filter pointTx
      relations: { pointTx: true },
    });
    count =
      count > userWallet.pointTx.length ? userWallet.pointTx.length : count;
    const pointTxs = userWallet.pointTx
      .sort((a, b) => b.createdDate.getTime() - a.createdDate.getTime())
      .slice(0, count);

    return pointTxs.map((pointTx) => {
      const { id, updatedDate, walletId, ...rest } = pointTx;
      return rest;
    });
  }

  async addUSDT(uid: string, amount: number, runner?: QueryRunner) {
    if (amount <= 0) {
      throw new BadRequestException('Invalid amount');
    }
    const queryRunner = runner || this.datasource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const user = await queryRunner.manager
        .createQueryBuilder(User, 'user')
        .leftJoinAndSelect('user.wallet', 'wallet')
        .where('user.uid = :uid', { uid })
        .getOne();

      if (!user) {
        throw new BadRequestException('User not found');
      }

      const miniGameUsdtSender = await queryRunner.manager.findOne(Setting, {
        where: {
          key: SettingEnum.MINI_GAME_USDT_SENDER_ADDRESS,
        },
      });
      if (!miniGameUsdtSender)
        throw new Error('Mini Game USDT Sender not found');

      const usdtTx = new UsdtTx();
      usdtTx.amount = amount;
      usdtTx.status = TxStatus.PENDING;
      usdtTx.txHash = null;
      usdtTx.retryCount = 0;
      usdtTx.receiverAddress = user.wallet.walletAddress;
      usdtTx.senderAddress = miniGameUsdtSender.value;
      usdtTx.chainId = +this.configService.get('BASE_CHAIN_ID');
      usdtTx.txType = UsdtTxType.CAMPAIGN;
      await queryRunner.manager.save(usdtTx);

      const walletTx = new WalletTx();
      walletTx.txAmount = amount;
      walletTx.txType = WalletTxType.CAMPAIGN;
      walletTx.status = TxStatus.PENDING;
      walletTx.userWalletId = user.wallet.id;
      walletTx.usdtTx = usdtTx;

      await queryRunner.manager.save(walletTx);
      usdtTx.walletTxId = walletTx.id;
      await queryRunner.manager.save(usdtTx);
      return walletTx;
    } catch (error) {
      console.error(error);
      if (!runner) await queryRunner.rollbackTransaction();
    } finally {
      if (!runner && !queryRunner.isReleased) await queryRunner.release();
    }
  }

  async getDepositTransactions(count: number) {
    const walletTxs = await this.walletTxRepository
      .createQueryBuilder('walletTx')
      .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
      .leftJoinAndSelect('userWallet.user', 'user')
      .where('walletTx.txType = :txType', { txType: WalletTxType.DEPOSIT })
      .andWhere('walletTx.status = :status', { status: TxStatus.SUCCESS })
      .orderBy('walletTx.id', 'DESC')
      .limit(count)
      .getMany();

    return walletTxs.map((walletTx) => {
      return {
        uid: walletTx.userWallet.user.uid,
        amount: parseFloat(Number(walletTx.txAmount).toFixed(2)),
        txHash: walletTx.txHash,
        createdDate: walletTx.createdDate,
      };
    });
  }

  async getWithdrawTransactions(count: number) {
    const walletTxs = await this.walletTxRepository
      .createQueryBuilder('walletTx')
      .leftJoinAndSelect('walletTx.redeemTx', 'redeemTx')
      .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
      .leftJoinAndSelect('userWallet.user', 'user')
      .where('walletTx.txType = :txType', { txType: WalletTxType.REDEEM })
      .andWhere('walletTx.status = :status', { status: TxStatus.SUCCESS })
      .orderBy('walletTx.id', 'DESC')
      .limit(count)
      .getMany();

    return walletTxs.map((walletTx) => {
      return {
        uid: walletTx.userWallet.user.uid,
        amount: parseFloat(Number(walletTx.txAmount).toFixed(2)),
        txHash: walletTx.redeemTx.payoutTxHash,
        createdDate: walletTx.createdDate,
      };
    });
  }

  async getUserJackpotTicket(userId: number, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [jackpotTx, totalCount] = await this.jackpotTxRepository
      .createQueryBuilder('jackpotTx')
      .leftJoinAndSelect('jackpotTx.walletTx', 'walletTx')
      .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
      .leftJoinAndSelect('userWallet.user', 'user')
      .leftJoinAndSelect('jackpotTx.jackpot', 'jackpot')
      .where('user.id = :userId', { userId })
      .andWhere('jackpotTx.status = :status', { status: TxStatus.SUCCESS })
      .andWhere('jackpot.id != :jackpotId', { jackpotId: 1 })
      .orderBy('jackpotTx.id', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: jackpotTx.map((jackpotTx) => {
        return {
          id: jackpotTx.id,
          hashGenerated: jackpotTx.randomHash,
          createdTime: jackpotTx.createdDate,
          explorerUrl: `${this.configService.get(
            `BLOCK_EXPLORER_URL_${this.configService.get('BASE_CHAIN_ID')}`,
          )}/tx/${jackpotTx.txHash}`,
          availableClaim: jackpotTx.availableClaim,
          payoutAmount: Number(jackpotTx.payoutAmount),
        };
      }),
      totalCount,
      currentPage: page,
    };
  }

  async getUserJackpotTickets(userId: number, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [jackpotTx, totalCount] = await this.jackpotTxRepository
      .createQueryBuilder('jackpotTx')
      .leftJoinAndSelect('jackpotTx.walletTx', 'walletTx')
      .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
      .leftJoinAndSelect('userWallet.user', 'user')
      .leftJoinAndSelect('jackpotTx.jackpot', 'jackpot')
      .where('user.id = :userId', { userId })
      .andWhere('jackpotTx.status = :status', { status: TxStatus.SUCCESS })
      .andWhere('jackpot.id > :jackpotId', { jackpotId: 1 })
      .orderBy('jackpotTx.id', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: jackpotTx.map((jackpotTx) => {
        return {
          id: jackpotTx.id,
          hashGenerated: jackpotTx.randomHash,
          createdTime: jackpotTx.createdDate,
          explorerUrl: `${this.configService.get(
            `BLOCK_EXPLORER_URL_${this.configService.get('BASE_CHAIN_ID')}`,
          )}/tx/${jackpotTx.txHash}`,
          availableClaim: jackpotTx.availableClaim,
          payoutAmount: Number(jackpotTx.payoutAmount),
          resultStatus: jackpotTx.jackpot.jackpotHash
            ? jackpotTx.payoutAmount > 0
              ? 'S' // Matched
              : 'F' // Not Matched
            : 'P', // To be revealed soon
        };
      }),
      totalCount,
      currentPage: page,
    };
  }
}
