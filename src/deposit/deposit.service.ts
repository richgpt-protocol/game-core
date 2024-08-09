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
  QueryRunner,
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
import {
  JsonRpcProvider,
  Provider,
  ethers,
  parseEther,
  parseUnits,
} from 'ethers';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';
import { User } from 'src/user/entities/user.entity';
import { ReferralTx } from 'src/referral/entities/referral-tx.entity';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { PointService } from 'src/point/point.service';
import { UserService } from 'src/user/user.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MPC } from 'src/shared/mpc';
import { Mutex } from 'async-mutex';

@Injectable()
export class DepositService {
  private DEPOSIT_NOTIFY_THRESHOLD = 100; //TODO move to settings table
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
    private readonly userService: UserService,
    private eventEmitter: EventEmitter2,
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

      if (!userWallet) return;

      if (payload.amount >= this.DEPOSIT_NOTIFY_THRESHOLD) {
        await this.adminNotificationService.setAdminNotification(
          `Deposit of ${payload.amount} ${payload.tokenAddress} received at ${payload.walletAddress}`,
          'DEPOSIT_THRESHOLD_NOTIFICATION',
          'Deposit Threshold Notification',
          false,
          true,
        );
      }

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

      // const nativeBalance = await this.getNativeBalance(
      //   payload.walletAddress,
      //   payload.chainId,
      // );
      // const minimumNativeBalance = this.configService.get(
      //   `MINIMUM_NATIVE_BALANCE_${payload.chainId}`,
      // );

      await this.reloadWallet(payload.walletAddress);
      // const reloadTx = await this.reloadWallet(payload, +minimumNativeBalance);
      // reloadTx.userWallet = userWallet;
      // reloadTx.userWalletId = userWallet.id;

      // await queryRunner.manager.save(reloadTx);

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

  private async reloadWallet(walletAddress: string) {
    await this.eventEmitter.emit(
      'gas.service.reload',
      walletAddress,
      Number(process.env.OPBNB_CHAIN_ID),
    );
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
        await MPC.retrievePrivateKey(
          this.configService.get('SUPPLY_ACCOUNT_ADDRESS'),
        ),
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

  /**
   *
   * @returns Whether the user has enough balance
   */
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

  private async handleReferralFlow(
    userId: number,
    depositAmount: number,
    gameUsdTxId: number,
    depositGameUsdTxHash: string,
  ) {
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

      // const commisionAmount =
      //   depositAmount * this.referralCommissionByRank(userInfo.referralRank);

      const previousWalletTx = await queryRunner.manager.findOne(WalletTx, {
        where: {
          userWalletId: userInfo.referralUserId,
          status: 'S',
        },
        order: {
          createdDate: 'DESC',
        },
      });

      const walletTxStartingBalance = previousWalletTx?.endingBalance || 0;
      // const walletTxEndingBalance =
      // (Number(previousWalletTx?.endingBalance) || 0) +
      // Number(commisionAmount);

      const walletTxInsertResult = await queryRunner.manager.insert(WalletTx, {
        txType: 'REFERRAL',
        txAmount: 0,
        status: 'S',
        userWalletId: userInfo.referralUserId,
        userWallet: userInfo.referralUser.wallet,
        txHash: depositGameUsdTxHash,
        startingBalance: walletTxStartingBalance,
        endingBalance: walletTxStartingBalance,
      });

      const walletTx = await queryRunner.manager
        .createQueryBuilder(WalletTx, 'walletTx')
        .where('walletTx.id = :id', {
          id: walletTxInsertResult.identifiers[0].id,
        })
        .innerJoinAndSelect('walletTx.userWallet', 'userWallet')
        .getOne();

      // walletTx.userWallet.walletBalance = walletTx.endingBalance;
      // walletTx.userWallet.redeemableBalance =
      // Number(walletTx.userWallet.redeemableBalance) + Number(commisionAmount);
      // await queryRunner.manager.save(walletTx.userWallet);

      // const gameUsdTx = new GameUsdTx();
      // gameUsdTx.amount = commisionAmount;
      // gameUsdTx.status = 'S';
      // gameUsdTx.retryCount = 0;
      // gameUsdTx.chainId = +this.configService.get('GAMEUSD_CHAIN_ID');
      // gameUsdTx.senderAddress = this.configService.get(
      //   'GAMEUSD_POOL_CONTRACT_ADDRESS',
      // );
      // gameUsdTx.receiverAddress = userInfo.referralUser.wallet.walletAddress;
      // gameUsdTx.walletTxs = [walletTx];
      // gameUsdTx.walletTxId = walletTx.id;
      // gameUsdTx.txHash = depositGameUsdTxHash;

      // await queryRunner.manager.save(gameUsdTx);

      const referralTxInsertResult = await queryRunner.manager.insert(
        ReferralTx,
        {
          rewardAmount: walletTx.txAmount,
          referralType: 'DEPOSIT',
          status: 'S',
          userId: userInfo.id,
          walletTx: walletTx,
          referralUserId: userInfo.referralUserId, //one who receives the referral amount
          referralUser: walletTx.userWallet.user,
        },
      );
      // console.log('referralTx', referralTxInsertResult);
      await this.handleReferralDepositXp(depositAmount, walletTx, queryRunner);

      await queryRunner.commitTransaction();
    } catch (error) {
      console.error('Error in referral tx', error);
      this.adminNotificationService.setAdminNotification(
        `Error processing referral tx for gameUsdTx: ${gameUsdTxId}`,
        'REFERRAL_TX_ERROR',
        'Referral Tx Error',
        false,
      );
      await queryRunner.rollbackTransaction();
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  private async handleReferralDepositXp(
    depositAmount: number,
    walletTx: WalletTx,
    queryRunner: QueryRunner,
  ) {
    // console.log('referral walletTx', walletTx)
    const referrerXp = this.pointService.getReferralDepositXp(
      Number(depositAmount),
    );

    const lastValidPointTx = await queryRunner.manager.findOne(PointTx, {
      where: {
        walletId: walletTx.userWallet.id,
      },
      order: {
        createdDate: 'DESC',
      },
    });
    const pointTx = new PointTx();
    pointTx.amount = referrerXp;
    pointTx.txType = 'REFERRAL';
    pointTx.walletId = walletTx.userWallet.id;
    pointTx.userWallet = walletTx.userWallet;
    pointTx.walletTx = walletTx;
    pointTx.startingBalance = lastValidPointTx?.endingBalance || 0;
    pointTx.endingBalance =
      Number(pointTx.startingBalance) + Number(pointTx.amount);

    walletTx.userWallet.pointBalance = pointTx.endingBalance;

    await queryRunner.manager.save(pointTx);
    await queryRunner.manager.save(walletTx.userWallet);
  }

  // Runs every 10 second.
  // Sends the native tokens to the user wallet
  // isReloadCronRunning = false;
  // @Cron('*/10 * * * * *')
  // async handleReloadTx() {
  //   if (this.isReloadCronRunning) return;

  //   this.isReloadCronRunning = true;
  //   const pendingReloadTx = await this.reloadTxRepository
  //     .createQueryBuilder('reloadTx')
  //     .innerJoinAndSelect('reloadTx.userWallet', 'userWallet')
  //     .where('reloadTx.status IN (:...statuses)', { statuses: ['P', 'F'] })
  //     .andWhere('reloadTx.retryCount <= :retryCount', { retryCount: 5 })
  //     .getMany();

  //   for (const tx of pendingReloadTx) {
  //     console.log('Processing reload tx', tx);

  //     try {
  //       if (tx.retryCount >= 5) {
  //         tx.status = 'F';
  //         await this.reloadTxRepository.save(tx);

  //         await this.adminNotificationService.setAdminNotification(
  //           `Reload transaction after 5 times for reload.tx.entity: ${tx.id}`,
  //           'RELOAD_FAILED_5_TIMES',
  //           'Native token transfer failed',
  //           false,
  //         );

  //         continue;
  //       }

  //       //send transaction
  //       const onchainTx = await this.transferNative(
  //         tx.userWallet.walletAddress,
  //         tx.amount,
  //         tx.chainId,
  //       );
  //       const receipt = await onchainTx.wait(1);

  //       if (receipt.status == 1) {
  //         tx.status = 'S';
  //         tx.txHash = onchainTx.hash;
  //         await this.reloadTxRepository.save(tx);
  //       } else {
  //         tx.retryCount += 1;
  //         await this.reloadTxRepository.save(tx);
  //       }
  //     } catch (error) {
  //       console.log('Error in reload tx', error);
  //     }
  //   }

  //   this.isReloadCronRunning = false;
  // }

  escrowCronMutex = new Mutex();
  /**
   * 1. Get all pending deposit transactions
   * 2. For each transaction, check if the user has token balance and native balance, move the tokens to escrow
   * 3. If the user doesn't have enough native balance but have enough token balance, initiate a reload transaction
   */
  @Cron('* * * * *')
  async handleEscrowTx() {
    const release = await this.escrowCronMutex.acquire();

    try {
      const pendingDepositTxns = await this.depositRepository
        .createQueryBuilder('depositTx')
        .innerJoinAndSelect('depositTx.walletTx', 'walletTx')
        .innerJoinAndSelect('walletTx.userWallet', 'userWallet')
        .where('depositTx.status = :status', { status: 'P' })
        .orderBy('depositTx.id', 'ASC')
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

          // Returns false if the user doesn't have enough balance and reload is pending
          const hasNativeBalance = await this.checkNativeBalance(
            tx.walletTx.userWallet,
            tx.chainId,
          );
          // If its false, that means a reload might be pending. So process this in next iteration.
          if (!hasNativeBalance) continue;

          const userWallet = await this.getUserWallet(tx.walletTx.userWalletId);
          const userSigner = await this.getSigner(
            userWallet.walletAddress,
            tx.chainId,
          );
          const tokenContract = await this.getTokenContract(
            tx.currency,
            userSigner,
          );

          const gameUsdContract = await this.getTokenContract(
            this.configService.get('GAMEUSD_CONTRACT_ADDRESS'),
            userSigner,
          );

          const gameUsdDepositSCAllowance = await gameUsdContract.allowance(
            userWallet.walletAddress,
            this.configService.get('DEPOSIT_CONTRACT_ADDRESS'),
          );

          if (gameUsdDepositSCAllowance < tx.walletTx.txAmount) {
            const approveTx = await gameUsdContract.approve(
              this.configService.get('DEPOSIT_CONTRACT_ADDRESS'),
              ethers.MaxUint256,
            );

            console.log(`Initial Approve tx hash: ${approveTx.hash}`);
          }

          const escrowAddress = this.configService.get('ESCROW_ADDRESS');
          let receipt, onchainEscrowTxHash;

          //reaches catch block if there is not enough native balance.
          try {
            const [userBalance, tokenDecimals] = await Promise.all([
              tokenContract.balanceOf(userWallet.walletAddress),
              tokenContract.decimals(),
            ]);
            const amount = parseUnits(
              tx.walletTx.txAmount.toString(),
              tokenDecimals,
            );

            if (userBalance >= amount) {
              const onchainEscrowTx = await this.transferToken(
                tokenContract,
                escrowAddress,
                amount,
              );

              receipt = await onchainEscrowTx.wait(1);
              onchainEscrowTxHash = onchainEscrowTx.hash;

              this.eventEmitter.emit(
                'gas.service.reload',
                userWallet.walletAddress,
                tx.chainId,
              );
            } else {
              console.log('skipping escrow tx', tx.id);
            }
          } catch (error) {
            //so incase of error, only need to set the deposit tx's status and retry
            console.log('Error in escrow tx, retrying reload txns', error);
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

            // await this.handleReferralFlow(userWallet.id, tx.walletTx.txAmount);
          } else if (receipt && receipt.status != 1) {
            tx.retryCount += 1;
            await queryRunner.manager.save(tx);
          }

          await queryRunner.commitTransaction();
        } catch (err) {
          console.log('Error in escrow tx', err);
          await queryRunner.rollbackTransaction();
        } finally {
          if (!queryRunner.isReleased) await queryRunner.release();
        }
      }
    } catch (error) {
      console.error('Error in escrow tx', error);
    } finally {
      release();
    }
  }

  async wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Runs every 10 seconds
  // Sends the gameUSD tokens to the user wallet
  gameUsdTxCronMutex = new Mutex();
  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleGameUsdTx() {
    const release = await this.gameUsdTxCronMutex.acquire();
    try {
      const pendingGameUsdTx = await this.getPendingGameUsdTx();

      for (const tx of pendingGameUsdTx) {
        try {
          console.log('Processing gameUSD tx', tx.id);

          if (tx.retryCount >= 5) {
            await this.updateGameUsdTxToFailed(tx);
            continue;
          }

          if (!tx.txHash) {
            //handles the onchain-transfer of gameUsd to user address.
            const isTxSuccess = await this.handleOnChainDeposit(tx);
            if (!isTxSuccess) continue;
          }

          // handles the db part of gameUsdTx sent to user address.
          await this.handleGameUSDTxHash(tx.id);
          console.log('done processing gameUSD tx', tx.id);
        } catch (error) {
          console.log('Error in cron gameUSD tx', error);
        }
      }
    } catch (error) {
      console.error('Error in gameUSD tx: releasing mutex', error);
    } finally {
      release();
    }
  }

  private async getUserWallet(userWalletId: number) {
    return await this.userWalletRepository.findOne({
      where: {
        id: userWalletId,
      },
    });
  }

  private async getSigner(walletAddress: string, chainId: number) {
    const provider = this.getProvider(chainId);
    return new ethers.Wallet(
      await MPC.retrievePrivateKey(walletAddress),
      provider,
    );
  }

  private async getTokenContract(tokenAddress: string, signer: ethers.Wallet) {
    return new ethers.Contract(
      tokenAddress,
      [
        `function transfer(address,uint256) external`,
        `function balanceOf(address) external view returns (uint256)`,
        `function decimals() external view returns (uint8)`,
        `function approve(address spender, uint256 amount) external returns (bool)`,

        `function allowance(address owner, address spender) external view returns (uint256)`,
      ],
      signer,
    );
  }

  private async getDepositContract(signer: ethers.Wallet) {
    return new ethers.Contract(
      this.configService.get('DEPOSIT_CONTRACT_ADDRESS'),
      [`function deposit(address user, uint256 amount) external`],
      signer,
    );
  }

  private async transferToken(
    tokenContract: ethers.Contract,
    to: string,
    amount: bigint,
  ) {
    const gasLimit = await tokenContract.transfer.estimateGas(to, amount);
    return await tokenContract.transfer(to, amount, {
      gasLimit: gasLimit + (gasLimit * BigInt(30)) / BigInt(100),
    });
  }

  private async getWalletTx(walletTxId: number) {
    return await this.dataSource.manager
      .createQueryBuilder(WalletTx, 'walletTx')
      .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
      .leftJoinAndSelect('userWallet.user', 'user')
      .where('walletTx.id = :id', { id: walletTxId })
      .getOne();
  }

  private async lastValidWalletTx(userWalletId: number) {
    return await this.dataSource.manager.findOne(WalletTx, {
      where: {
        userWalletId,
        status: 'S',
      },
      order: {
        createdDate: 'DESC',
      },
    });
  }

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

  private async depositGameUSD(
    to: string,
    amount: bigint,
    signer: ethers.Wallet,
  ) {
    const depositContract = await this.getDepositContract(signer);
    const gasLimit = await depositContract.deposit.estimateGas(to, amount);
    return await depositContract.deposit(to, amount, {
      gasLimit: gasLimit + (gasLimit * BigInt(30)) / BigInt(100),
    });
  }

  private async getPendingGameUsdTx() {
    return await this.gameUsdTxRepository.find({
      where: {
        status: 'P',
        senderAddress: In([
          this.configService.get('DEPOSIT_BOT_ADDRESS'),
          this.configService.get('GAMEUSD_POOL_CONTRACT_ADDRESS'),
        ]),
      },
      order: {
        id: 'ASC',
      },
    });
  }

  private async updateGameUsdTxToFailed(tx: GameUsdTx) {
    tx.status = 'F';
    await this.gameUsdTxRepository.save(tx);

    await this.dataSource.manager.update(
      WalletTx,
      {
        id: tx.walletTxId,
      },
      {
        status: 'F',
      },
    );

    await this.adminNotificationService.setAdminNotification(
      `GameUSD transaction after 5 times for gameUSD.tx.entity: ${tx.id}`,
      'GAMEUSD_TX_FAILED_5_TIMES',
      'GameUSD transfer transfer failed',
      false,
      tx.walletTxId,
    );
  }

  //handles the onchain-transfer of gameUsd to user address.
  private async handleOnChainDeposit(tx: GameUsdTx): Promise<boolean> {
    try {
      const depositAdminWallet = await this.getSigner(
        this.configService.get('DEPOSIT_BOT_ADDRESS'),
        tx.chainId,
      );
      const onchainGameUsdTx = await this.depositGameUSD(
        tx.receiverAddress,
        parseEther(tx.amount.toString()),
        depositAdminWallet,
      );

      tx.txHash = onchainGameUsdTx.hash;
      await onchainGameUsdTx.wait(1);

      this.eventEmitter.emit(
        'gas.service.reload',
        await depositAdminWallet.getAddress(),
        tx.chainId,
      );

      return true;
    } catch (error) {
      console.log('Error in gameUSD tx', error);
      tx.retryCount += 1;
      return false;
    } finally {
      await this.gameUsdTxRepository.save(tx);
    }
  }

  // handles the db part of gameUsdTx sent to user address.
  private async handleGameUSDTxHash(gameUsdTxId: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const gameUsdTx = await queryRunner.manager.findOne(GameUsdTx, {
        where: { id: gameUsdTxId },
      });
      const depositTxHash = gameUsdTx.txHash;
      const provider = this.getProvider(gameUsdTx.chainId);
      const receipt = await provider.getTransactionReceipt(depositTxHash);
      const walletTx = await this.getWalletTx(gameUsdTx.walletTxId);
      if (receipt && receipt.status == 1) {
        console.log('Deposit tx success', depositTxHash);
        gameUsdTx.status = 'S';

        const previousWalletTx = await this.lastValidWalletTx(
          walletTx.userWalletId,
        );

        walletTx.status = 'S';
        walletTx.startingBalance = previousWalletTx?.endingBalance || 0;
        walletTx.endingBalance =
          (Number(previousWalletTx?.endingBalance) || 0) +
          Number(gameUsdTx.amount);
        walletTx.userWallet.walletBalance = walletTx.endingBalance;

        const pointInfo = this.pointService.getDepositPoints(
          Number(walletTx.txAmount),
        );
        const lastValidPointTx = await this.lastValidPointTx(
          walletTx.userWallet.id,
        );
        // console.log('lastValidPointTx', lastValidPointTx);
        const pointTxAmount =
          pointInfo.xp + (walletTx.txAmount * pointInfo.bonusPerc) / 100;
        const pointTxStartingBalance = lastValidPointTx?.endingBalance || 0;
        const pointTxEndingBalance =
          Number(pointTxStartingBalance) + Number(pointTxAmount);
        const pointTxInsertResult = await queryRunner.manager.insert(PointTx, {
          amount: pointTxAmount,
          txType: 'DEPOSIT',
          walletId: walletTx.userWallet.id,
          userWallet: walletTx.userWallet,
          walletTx: walletTx,
          startingBalance: pointTxStartingBalance,
          endingBalance: pointTxEndingBalance,
        });
        // console.log('pointTxInsertResult', pointTxInsertResult);
        walletTx.userWallet.pointBalance = pointTxEndingBalance;

        await queryRunner.manager.save(walletTx.userWallet);
        await queryRunner.manager.save(walletTx);
        await queryRunner.manager.save(gameUsdTx);
        await queryRunner.commitTransaction();

        await this.userService.setUserNotification(walletTx.userWallet.userId, {
          type: 'Deposit',
          title: 'Deposit Processed Successfully',
          message: 'Your Deposit has been successfully processed',
          walletTxId: walletTx.id,
        });

        await this.handleReferralFlow(
          walletTx.userWallet.id,
          walletTx.txAmount,
          gameUsdTx.id,
          depositTxHash,
        );
      }
    } catch (error) {
      console.log('Error in gameUSD tx ', error);
      await queryRunner.rollbackTransaction();
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
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
