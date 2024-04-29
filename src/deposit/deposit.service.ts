/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  In,
  LessThan,
  MoreThan,
  MoreThanOrEqual,
  Not,
  Or,
  Repository,
} from 'typeorm';
// import { CreateDeopsitRequestDto, SupplyDto } from './dto/deposit.dto';
import axios, { AxiosResponse } from 'axios';
import { ConfigService } from 'src/config/config.service';
import { DepositTx } from 'src/wallet/entities/deposit-tx.entity';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { ReloadTx } from 'src/wallet/entities/reload-tx.entity';
import { DepositDTO } from './dto/deposit.dto';
import { Provider, ethers, parseUnits } from 'ethers';
import { Cron } from '@nestjs/schedule';
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';
import { User } from 'src/user/entities/user.entity';
import { ReferralTx } from 'src/referral/entities/referral-tx.entity';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { PointService } from 'src/point/point.service';

@Injectable()
export class DepositService {
  constructor(
    @InjectRepository(DepositTx)
    private depositRepository: Repository<DepositTx>,
    @InjectRepository(ReloadTx)
    private reloadTxRepository: Repository<ReloadTx>,
    @InjectRepository(GameUsdTx)
    private gameUsdTxRepository: Repository<GameUsdTx>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(ReferralTx)
    private referralTxRepository: Repository<ReferralTx>,
    @InjectRepository(UserWallet)
    private userWalletRepository: Repository<UserWallet>,
    // private httpService: HttpService,
    private readonly configService: ConfigService,
    private adminNotificationService: AdminNotificationService,
    private dataSource: DataSource,
    private readonly pointService: PointService,
  ) {}

  private referralCommissionByRank = (rank: number) => {
    switch (rank) {
      case 1:
        return 0.1;
      case 2:
        return 0.15;
      case 3:
        return 0.2;
      default:
        throw new Error('Invalid rank');
    }
  };

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

  async processDeposit(payload: DepositDTO) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const userWallet = await queryRunner.manager.findOne(UserWallet, {
        where: {
          walletAddress: payload.walletAddress,
        },
      });

      const walletTx = new WalletTx();
      walletTx.txType = 'DEPOSIT';
      walletTx.txAmount = payload.amount;
      walletTx.txHash = payload.txHash;
      walletTx.status = 'P';
      walletTx.userWallet = userWallet;
      walletTx.userWalletId = userWallet.id;

      const walletTxResult = await queryRunner.manager.save(walletTx);
      const depositTx = new DepositTx();
      depositTx.currency = payload.tokenAddress;
      depositTx.senderAddress = payload.depositerAddress;
      depositTx.receiverAddress = payload.walletAddress;
      depositTx.chainId = payload.chainId;
      depositTx.isTransferred = false;
      depositTx.txHash = null;
      depositTx.walletTx = walletTx;
      depositTx.walletTxId = walletTxResult.id;
      depositTx.retryCount = 0;
      depositTx.status = 'P';

      const nativeBalance = await this.getNativeBalance(
        payload.walletAddress,
        payload.chainId,
      );
      const minimumNativeBalance = this.configService.get(
        `MINIMUM_NATIVE_BALANCE_${payload.chainId}`,
      );

      const reloadTx = await this.reloadWallet(payload, +minimumNativeBalance);
      reloadTx.userWallet = userWallet;
      reloadTx.userWalletId = userWallet.id;

      const lastValidPointTx = await queryRunner.manager.findOne(PointTx, {
        where: {
          walletId: userWallet.id,
        },
        order: {
          createdDate: 'DESC',
        },
      });

      const pointInfo = this.pointService.getDepositPoints(payload.amount);
      const pointTx = new PointTx();
      pointTx.amount =
        pointInfo.xp + (payload.amount * pointInfo.bonusPerc) / 100;
      pointTx.txType = 'DEPOSIT';
      pointTx.walletId = userWallet.id;
      pointTx.userWallet = userWallet;
      pointTx.walletTx = walletTx;
      pointTx.startingBalance = lastValidPointTx?.endingBalance || 0;
      pointTx.endingBalance = pointTx.startingBalance + +pointTx.amount;

      await queryRunner.manager.save(reloadTx);

      await queryRunner.manager.save(depositTx);
      queryRunner.commitTransaction();
    } catch (error) {
      console.log(error);
      await queryRunner.rollbackTransaction();

      await this.adminNotificationService.setAdminNotification(
        `Error processing deposit for wallet: ${payload.walletAddress}. This will be retried after sometime.`,
        'DEPOSIT_TRANSACTION_ROLLBACK',
        'Deposit Failed',
        false,
      );

      throw new InternalServerErrorException('Error processing deposit');
    } finally {
      // if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  private currencyByChainId(chainId: number) {
    switch (chainId) {
      case 5611:
        return 'BNB';
      default:
        return 'ETH';
    }
  }

  private async reloadWallet(
    payload: DepositDTO,
    reloadAmount: number,
  ): Promise<ReloadTx> {
    const currencyLabel = this.currencyByChainId(payload.chainId);
    const reloadTx = new ReloadTx();
    reloadTx.chainId = payload.chainId;
    reloadTx.status = 'P';
    reloadTx.amount = reloadAmount;
    reloadTx.txHash = null;
    reloadTx.currency = currencyLabel;
    reloadTx.retryCount = 0;
    reloadTx.amountInUSD =
      reloadAmount *
      (await this.getPriceInUSD(
        currencyLabel === 'BNB' ? 'binancecoin' : 'ethereum',
      ));

    // try {
    //   const tx = await this.transferNative(
    //     payload.walletAddress,
    //     reloadAmount,
    //     payload.chainId,
    //   );

    //   this.eventEmitter.emit('reload', {
    //     reloadTx,
    //     tx,
    //   });
    // } catch (error) {
    //   console.log(`Error Native transfer tx ${reloadTx.id}`, error);
    // }

    return reloadTx;
  }

  private async getPriceInUSD(currency: string): Promise<number> {
    try {
      const priceUrl = this.configService.get('CRYPTO_PRICE_API_URL');
      const response = await axios.get(priceUrl);
      const price = +response.data[currency].usd;
      return price;
    } catch (error) {
      console.error('Error fetching price', error);
      return 0;
    }
  }

  private async getNativeBalance(walletAddress: string, chainId: number) {
    const provider = this.getProvider(chainId);
    const nativeBalance = await provider.getBalance(walletAddress);
    return nativeBalance;
  }

  private getProvider(chainId: number): Provider {
    const providerUrl = this.configService.get(`PROVIDER_URL_${chainId}`);
    return new ethers.JsonRpcProvider(providerUrl);
  }

  private async transferNative(
    target: string,
    amount: number,
    chainId: number,
  ) {
    try {
      const supplyWallet = new ethers.Wallet(
        this.configService.get('SUPPLY_ACCOUNT_PK'),
        this.getProvider(chainId),
      );
      const gasLimit = await supplyWallet.provider.estimateGas({
        to: target,
        value: ethers.parseEther(amount.toString()),
      });

      const tx = await supplyWallet.sendTransaction({
        to: target,
        value: ethers.parseEther(amount.toString()),
        gasLimit: gasLimit + (gasLimit * BigInt(30)) / BigInt(100),
      });
      return tx;
    } catch (error) {
      throw error;
    }
  }

  private async handleReferralFlow(userId: number, depositWalletTx: WalletTx) {
    const depositAmount = depositWalletTx.txAmount;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const userInfo = await queryRunner.manager
        .createQueryBuilder(User, 'user')
        .leftJoinAndSelect('user.referralUser', 'referralUser')
        .leftJoinAndSelect('referralUser.wallet', 'wallet')
        .where('user.id = :id', { id: userId })
        .getOne();

      if (!userInfo || userInfo.referralUserId == null) return;

      const commisionAmount =
        depositAmount * this.referralCommissionByRank(userInfo.referralRank);

      const walletTx = new WalletTx();
      walletTx.txType = 'REFERRAL';
      walletTx.txAmount = commisionAmount;
      walletTx.status = 'P';
      walletTx.userWalletId = userInfo.referralUserId;

      await queryRunner.manager.save(walletTx);

      const gameUsdTx = new GameUsdTx();
      gameUsdTx.amount = commisionAmount;
      gameUsdTx.status = 'P';
      gameUsdTx.retryCount = 0;
      gameUsdTx.chainId = +this.configService.get('GAMEUSD_CHAIN_ID');
      gameUsdTx.senderAddress = this.configService.get('GAMEUSD_POOL_ADDRESS');
      gameUsdTx.receiverAddress = userInfo.referralUser.wallet.walletAddress;
      gameUsdTx.walletTxs = [walletTx, depositWalletTx];
      gameUsdTx.walletTxId = walletTx.id;

      await queryRunner.manager.save(gameUsdTx);
      await queryRunner.commitTransaction();
    } catch (error) {
      console.error('Error in referral tx - depositModule', error);
      await queryRunner.rollbackTransaction();
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  // Runs every 10 second.
  // Sends the native tokens to the user wallet
  isReloadCronRunning = false;
  @Cron('*/10 * * * * *')
  async handleReloadTx() {
    if (this.isReloadCronRunning) return;

    this.isReloadCronRunning = true;
    const pendingReloadTx = await this.reloadTxRepository
      .createQueryBuilder('reloadTx')
      .innerJoinAndSelect('reloadTx.userWallet', 'userWallet')
      .where('reloadTx.status IN (:...statuses)', { statuses: ['P', 'F'] })
      .andWhere('reloadTx.retryCount <= :retryCount', { retryCount: 5 })
      .getMany();

    for (const tx of pendingReloadTx) {
      console.log('Processing reload tx', tx);

      try {
        if (tx.retryCount >= 5) {
          tx.status = 'F';
          await this.reloadTxRepository.save(tx);

          await this.adminNotificationService.setAdminNotification(
            `Reload transaction after 5 times for reload.tx.entity: ${tx.id}`,
            'RELOAD_FAILED_5_TIMES',
            'Native token transfer failed',
            false,
          );

          continue;
        }

        //send transaction
        const onchainTx = await this.transferNative(
          tx.userWallet.walletAddress,
          tx.amount,
          tx.chainId,
        );
        const receipt = await onchainTx.wait(1);

        if (receipt.status == 1) {
          tx.status = 'S';
          tx.txHash = onchainTx.hash;
          await this.reloadTxRepository.save(tx);
        } else {
          tx.retryCount += 1;
          await this.reloadTxRepository.save(tx);
        }
      } catch (error) {
        console.log('Error in reload tx', error);
      }
    }

    this.isReloadCronRunning = false;
  }

  isEscrowCronRunning = false;
  /**
   * 1. Get all pending deposit transactions
   * 2. For each transaction, check if the user has token balance and native balance, move the tokens to escrow
   * 3. If the user doesn't have enough native balance but have enough token balance, initiate a reload transaction
   */
  @Cron('* * * * *')
  async handleEscrowTx() {
    if (this.isEscrowCronRunning) return;
    this.isEscrowCronRunning = true;
    const pendingDepositTxns = await this.depositRepository
      .createQueryBuilder('depositTx')
      .innerJoinAndSelect('depositTx.walletTx', 'walletTx')
      .where('depositTx.status = :status', { status: 'P' })
      .getMany();

    for (const tx of pendingDepositTxns) {
      console.log('Processing escrow tx', tx.id);
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        if (tx.retryCount >= 5) {
          tx.status = 'F';
          await queryRunner.manager.save(tx);

          await this.adminNotificationService.setAdminNotification(
            `Transaction to escrow failed after 5 times for Deposit.tx.entity: ${tx.id}`,
            'ESCROW_FAILED_5_TIMES',
            'Transfer to Escrow Failed',
            false,
            tx.walletTxId,
          );
          continue;
        }

        const userWallet = await queryRunner.manager.findOne(UserWallet, {
          where: {
            id: tx.walletTx.userWalletId,
          },
        });

        const provider = this.getProvider(tx.chainId);
        const userSigner = new ethers.Wallet(userWallet.privateKey, provider);
        const tokenContract = new ethers.Contract(
          tx.currency,
          [
            `function transfer(address,uint256) external`,
            `function balanceOf(address) external view returns (uint256)`,
            `function decimals() external view returns (uint8)`,
          ],
          userSigner,
        );

        const escrowAddress = this.configService.get('ESCROW_ADDRESS');
        let receipt, onchainEscrowTxHash;

        //reaches catch block if there is not enough native balance.
        try {
          const [userBalance, tokenDecimals] = await Promise.all([
            tokenContract.balanceOf(userWallet.walletAddress),
            tokenContract.decimals(),
          ]);

          if (
            userBalance >=
            parseUnits(tx.walletTx.txAmount.toString(), tokenDecimals)
          ) {
            const gasLimit = await tokenContract.transfer.estimateGas(
              escrowAddress,
              parseUnits(tx.walletTx.txAmount.toString(), tokenDecimals),
            );
            const onchainEscrowTx = await tokenContract.transfer(
              escrowAddress,
              parseUnits(tx.walletTx.txAmount.toString(), tokenDecimals),
              {
                gasLimit: gasLimit + (gasLimit * BigInt(30)) / BigInt(100),
              },
            );

            receipt = await onchainEscrowTx.wait(1);
            onchainEscrowTxHash = onchainEscrowTx.hash;
          } else {
            console.log('skipping escrow tx', tx.id);
          }
        } catch (error) {
          //user doesn't have enough native balance, but has enough token balance.
          //trigger the failed reload tx

          //so incase of error, only need to set the deposit tx's status and retry
          console.log('Error in escrow tx, retrying reload txns', error);

          const reloadTx = await queryRunner.manager.findOne(ReloadTx, {
            where: {
              status: 'F',
              retryCount: MoreThanOrEqual(5),
              userWalletId: userWallet.id,
            },
          });

          if (reloadTx) {
            reloadTx.retryCount = 0;
            reloadTx.status = 'P';

            await queryRunner.manager.save(ReloadTx, reloadTx);
          }
        }

        console.log(
          'receipt',
          receipt,
          'onchainEscrowTxHash',
          onchainEscrowTxHash,
        );

        if (receipt && receipt.status == 1) {
          tx.status = 'S';
          tx.txHash = onchainEscrowTxHash;
          tx.isTransferred = true;

          const gameUsdTx = new GameUsdTx();
          gameUsdTx.amount = tx.walletTx.txAmount;
          gameUsdTx.status = 'P';
          gameUsdTx.txHash = null;
          gameUsdTx.retryCount = 0;
          gameUsdTx.chainId = +this.configService.get('GAMEUSD_CHAIN_ID');
          gameUsdTx.senderAddress = this.configService.get(
            'DEPOSIT_BOT_ADDRESS',
          );
          gameUsdTx.receiverAddress = userWallet.walletAddress;
          gameUsdTx.walletTxs = [tx.walletTx];
          gameUsdTx.walletTxId = tx.walletTx.id;
          await queryRunner.manager.save(tx);
          await queryRunner.manager.save(gameUsdTx);
          await queryRunner.commitTransaction();

          await this.handleReferralFlow(userWallet.id, tx.walletTx);
        } else if (receipt && receipt.status != 1) {
          tx.retryCount += 1;
          await queryRunner.manager.save(tx);
          await queryRunner.commitTransaction();
        }
      } catch (err) {
        console.log('Error in escrow tx', err);
        await queryRunner.rollbackTransaction();
      } finally {
        if (!queryRunner.isReleased) await queryRunner.release();
      }
    }

    this.isEscrowCronRunning = false;
  }

  // Runs every 10 seconds
  // Sends the gameUSD tokens to the user wallet
  isGameUSDCronRunning = false;
  @Cron('*/10 * * * * *')
  async handleGameUsdTx() {
    if (this.isGameUSDCronRunning) return;

    this.isGameUSDCronRunning = true;

    const pendingGameUsdTx = await this.gameUsdTxRepository.find({
      where: {
        status: 'P',
        senderAddress: In([
          this.configService.get('DEPOSIT_BOT_ADDRESS'),
          this.configService.get('GAMEUSD_POOL_ADDRESS'),
        ]),
      },
      relations: ['walletTxs'],
    });

    for (const tx of pendingGameUsdTx) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        //Find walletTx with txType other than DEPOSIT AND REFERRAL. For bet flow, its "PLAY".
        const unSupportedWalletTxns = tx.walletTxs.find(
          (_walletTx) =>
            _walletTx.txType != 'DEPOSIT' && _walletTx.txType != 'REFERRAL',
        );

        //do not process gameUsdTx from a different module.
        if (unSupportedWalletTxns) continue;

        console.log('Processing gameUSD tx', tx.id);

        if (tx.retryCount >= 5) {
          tx.status = 'F';
          await queryRunner.manager.save(tx);

          await this.adminNotificationService.setAdminNotification(
            `GameUSD transaction after 5 times for gameUSD.tx.entity: ${tx.id}`,
            'GAMEUSD_TX_FAILED_5_TIMES',
            'GameUSD transfer transfer failed',
            false,
            tx.walletTxId,
          );
          continue;
        }

        const provider = this.getProvider(tx.chainId);
        const gameUsdWallet = new ethers.Wallet(
          this.configService.get('DEPOSIT_BOT_PK'),
          provider,
        );

        const gameUsdContract = new ethers.Contract(
          this.configService.get('DEPOSIT_CONTRACT_ADDRESS'),
          [`function deposit(address user, uint256 amount) external`],
          gameUsdWallet,
        );

        const gasLimit = await gameUsdContract.deposit.estimateGas(
          tx.receiverAddress,
          parseUnits(tx.amount.toString(), 18),
        );

        const onchainGameUsdTx = await gameUsdContract.deposit(
          tx.receiverAddress,
          parseUnits(tx.amount.toString(), 18), //18 decimals for gameUSD
          {
            gasLimit: gasLimit + (gasLimit * BigInt(30)) / BigInt(100),
          },
        );

        const receipt = await onchainGameUsdTx.wait();
        if (receipt.status == 1) {
          console.log('receipt', receipt);
          tx.status = 'S';
          tx.txHash = onchainGameUsdTx.hash;
          await queryRunner.manager.save(tx);

          const walletTx = await queryRunner.manager
            .createQueryBuilder(WalletTx, 'walletTx')
            .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
            .leftJoinAndSelect('userWallet.user', 'user')
            .where('walletTx.id = :id', { id: tx.walletTxId })
            .getOne();

          walletTx.status = 'S';
          walletTx.txHash = receipt.hash;

          // console.log('walletTx', walletTx);

          const previousWalletTx = await queryRunner.manager.findOne(WalletTx, {
            where: {
              userWalletId: walletTx.userWalletId,
              id: Not(tx.walletTxId),
              status: 'S',
            },
            order: {
              createdDate: 'DESC',
            },
          });

          walletTx.startingBalance = previousWalletTx?.endingBalance || 0;
          walletTx.endingBalance =
            (Number(previousWalletTx?.endingBalance) || 0) + Number(tx.amount);

          walletTx.userWallet.walletBalance = walletTx.endingBalance;

          if (walletTx.txType == 'REFERRAL') {
            const referralTx = new ReferralTx();
            referralTx.rewardAmount = walletTx.txAmount;
            referralTx.referralType = 'DEPOSIT';
            referralTx.status = 'S';
            referralTx.userId = walletTx.userWallet.user.id;
            referralTx.walletTx = walletTx;
            referralTx.referralUserId = walletTx.userWallet.user.id;
            referralTx.referralUser = walletTx.userWallet.user;
            walletTx.userWallet.redeemableBalance = tx.amount;

            await queryRunner.manager.save(referralTx);
          }

          await queryRunner.manager.save(walletTx.userWallet);
          await queryRunner.manager.save(walletTx);

          await queryRunner.commitTransaction();
        }
      } catch (error) {
        console.log('Error in gameUSD tx', error);
        await queryRunner.rollbackTransaction();
      } finally {
        if (!queryRunner.isReleased) await queryRunner.release();
      }
    }
    this.isGameUSDCronRunning = false;
  }
}

/**
 * Flow
 * 1. Process all the relaod transactions first
 * 2. Process all the deposit transactions every one minute.
 *     - In case there is no enough native balance, initiates/restarts the reload transaction.
 *     - In case there is no enough token balance, skips the transaction.
 *     - In case of success, transfer the gameUSD txns is added to the db.
 * 3. Process all the gameUSD transactions every 10 seconds.
 *
 */
