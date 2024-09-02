/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  // In,
  // LessThan,
  // MoreThan,
  // MoreThanOrEqual,
  // Not,
  // Or,
  // QueryRunner,
  Repository,
} from 'typeorm';
// import { CreateDeopsitRequestDto, SupplyDto } from './dto/deposit.dto';
// import axios, { AxiosResponse } from 'axios';
import { ConfigService } from 'src/config/config.service';
import { DepositTx } from 'src/wallet/entities/deposit-tx.entity';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { ReloadTx } from 'src/wallet/entities/reload-tx.entity';
import { DepositDTO } from '../dto/deposit.dto';
import {
  // JsonRpcProvider,
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
  private readonly cronMutex: Mutex = new Mutex();

  constructor(
    @InjectRepository(DepositTx)
    private depositRepository: Repository<DepositTx>,
    // @InjectRepository(ReloadTx)
    // private reloadTxRepository: Repository<ReloadTx>,
    @InjectRepository(GameUsdTx)
    private gameUsdTxRepository: Repository<GameUsdTx>,
    // @InjectRepository(User)
    // private userRepository: Repository<User>,
    // @InjectRepository(ReferralTx)
    // private referralTxRepository: Repository<ReferralTx>,
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

  // private referralCommissionByRank = (rank: number) => {
  //   switch (rank) {
  //     case 1:
  //       return 0.1;
  //     case 2:
  //       return 0.15;
  //     case 3:
  //       return 0.2;
  //     default:
  //       throw new Error('Invalid rank');
  //   }
  // };

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
    console.log('start processDeposit()');

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

      if (payload.amount < 1) {
        // deposit amount less than $1, inform admin and do nothing
        await this.adminNotificationService.setAdminNotification(
          `Error processing deposit for wallet: ${payload.walletAddress} \n
          Minimum Deposit Amount not met. \n
          UserId: ${userWallet.userId}. \n
          Deposit amount: ${payload.amount} \n
          TxHash: ${payload.txHash}`,
          'MINIMUM_DEPOSIT_AMOUNT',
          'Deposit Failed',
          false,
          true,
        );
        return;
      }

      if (payload.amount >= this.DEPOSIT_NOTIFY_THRESHOLD) {
        // deposit amount more than DEPOSIT_NOTIFY_THRESHOLD, inform admin and proceed
        await this.adminNotificationService.setAdminNotification(
          `Deposit of ${payload.amount} ${payload.tokenAddress} received at ${payload.walletAddress}`,
          'DEPOSIT_THRESHOLD_NOTIFICATION',
          'Deposit Threshold Notification',
          false,
          true,
        );
      }

      // create walletTx with status pending
      const walletTx = new WalletTx();
      walletTx.txType = 'DEPOSIT';
      walletTx.txAmount = payload.amount;
      walletTx.txHash = payload.txHash;
      walletTx.status = 'P';
      walletTx.userWalletId = userWallet.id;
      walletTx.userWallet = userWallet;
      const walletTxResult = await queryRunner.manager.save(walletTx);
      console.log('walletTx in processDeposit()', walletTx);

      // create depositTx with status pending
      const depositTx = new DepositTx();
      depositTx.currency = payload.tokenAddress;
      depositTx.senderAddress = payload.depositerAddress;
      depositTx.receiverAddress = payload.walletAddress;
      depositTx.chainId = payload.chainId;
      depositTx.isTransferred = false;
      depositTx.status = 'P';
      depositTx.walletTxId = walletTxResult.id;
      depositTx.walletTx = walletTx;
      await queryRunner.manager.save(depositTx);
      console.log('depositTx in processDeposit():', depositTx);

      await this.reloadWallet(payload.walletAddress);

      await queryRunner.commitTransaction();

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
      await queryRunner.release();
    }
  }

  // private currencyByChainId(chainId: number) {
  //   switch (chainId) {
  //     case 5611:
  //       return 'BNB';
  //     default:
  //       return 'ETH';
  //   }
  // }

  private async reloadWallet(walletAddress: string) {
    await this.eventEmitter.emit(
      'gas.service.reload',
      walletAddress,
      Number(process.env.OPBNB_CHAIN_ID),
    );
  }

  // private async getPriceInUSD(currency: string): Promise<number> {
  //   try {
  //     const priceUrl = this.configService.get('CRYPTO_PRICE_API_URL');
  //     const response = await axios.get(priceUrl);
  //     const price = +response.data[currency].usd;
  //     return price;
  //   } catch (error) {
  //     console.error('Error fetching price', error);
  //     return 0;
  //   }
  // }

  // private async getNativeBalance(walletAddress: string, chainId: number) {
  //   const provider = this.getProvider(chainId);
  //   const nativeBalance = await provider.getBalance(walletAddress);
  //   return nativeBalance;
  // }

  private getProvider(chainId: number): Provider {
    const providerUrl = this.configService.get(`PROVIDER_URL_${chainId}`);
    return new ethers.JsonRpcProvider(providerUrl);
  }

  // private async transferNative(
  //   target: string,
  //   amount: number,
  //   chainId: number,
  // ) {
  //   try {
  //     const supplyWallet = new ethers.Wallet(
  //       await MPC.retrievePrivateKey(
  //         this.configService.get('SUPPLY_ACCOUNT_ADDRESS'),
  //       ),
  //       this.getProvider(chainId),
  //     );
  //     const gasLimit = await supplyWallet.provider.estimateGas({
  //       to: target,
  //       value: ethers.parseEther(amount.toString()),
  //     });

  //     const tx = await supplyWallet.sendTransaction({
  //       to: target,
  //       value: ethers.parseEther(amount.toString()),
  //       gasLimit: gasLimit + (gasLimit * BigInt(30)) / BigInt(100),
  //     });
  //     return tx;
  //   } catch (error) {
  //     throw error;
  //   }
  // }

  /**
   *
   * @returns Whether the user has enough balance
   */
  // private async checkNativeBalance(
  //   userWallet: UserWallet,
  //   chainId: number,
  // ): Promise<boolean> {
  //   try {
  //     const provider = new JsonRpcProvider(
  //       this.configService.get('OPBNB_PROVIDER_RPC_URL'),
  //     );

  //     const nativeBalance = await provider.getBalance(userWallet.walletAddress);

  //     const minimumNativeBalance = this.configService.get(
  //       `MINIMUM_NATIVE_BALANCE_${chainId}`,
  //     );

  //     if (nativeBalance < parseUnits(minimumNativeBalance, 18)) {
  //       const pendingReloadTx = await this.reloadTxRepository.findOne({
  //         where: {
  //           userWalletId: userWallet.id,
  //           chainId,
  //           status: 'P',
  //         },
  //       });

  //       if (!pendingReloadTx) {
  //         console.log(
  //           'Deposit: Emitting gas.service.reload event for userWallet:',
  //           userWallet.walletAddress,
  //         );
  //         this.eventEmitter.emit(
  //           'gas.service.reload',
  //           userWallet.walletAddress,
  //           chainId,
  //         );
  //       }

  //       return false;
  //     } else {
  //       return true;
  //     }
  //   } catch (error) {
  //     console.error('Error in checkNativeBalance', error);
  //     return false;
  //   }
  // }

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

      // console.log('userInfo', userInfo);

      if (!userInfo || userInfo.referralUserId == null) return;

      // const commisionAmount =
      //   depositAmount * this.referralCommissionByRank(userInfo.referralRank);

      // const previousWalletTx = await queryRunner.manager.findOne(WalletTx, {
      //   where: {
      //     userWalletId: userInfo.referralUserId,
      //     status: 'S',
      //   },
      //   order: {
      //     createdDate: 'DESC',
      //   },
      // });

      // const walletTxStartingBalance = previousWalletTx?.endingBalance || 0;
      // const walletTxEndingBalance =
      // (Number(previousWalletTx?.endingBalance) || 0) +
      // Number(commisionAmount);

      // const walletTxInsertResult = await queryRunner.manager.insert(WalletTx, {
      //   txType: 'REFERRAL',
      //   txAmount: 0,
      //   status: 'S',
      //   userWalletId: userInfo.referralUserId,
      //   userWallet: userInfo.referralUser.wallet,
      //   txHash: depositGameUsdTxHash,
      //   startingBalance: walletTxStartingBalance,
      //   endingBalance: walletTxStartingBalance,
      // });

      // const walletTx = await queryRunner.manager
      //   .createQueryBuilder(WalletTx, 'walletTx')
      //   .where('walletTx.id = :id', {
      //     id: walletTxInsertResult.identifiers[0].id,
      //   })
      //   .innerJoinAndSelect('walletTx.userWallet', 'userWallet')
      //   .getOne();

      // walletTx.userWallet.walletBalance = walletTx.endingBalance;
      // walletTx.userWallet.redeemableBalance =
      // Number(walletTx.userWallet.redeemableBalance) + Number(commisionAmount);
      // await queryRunner.manager.save(walletTx.userWallet);

      // const gameUsdTx = new GameUsdTx();
      // gameUsdTx.amount = commisionAmount;
      // gameUsdTx.status = 'S';
      // gameUsdTx.chainId = +this.configService.get('GAMEUSD_CHAIN_ID');
      // gameUsdTx.senderAddress = this.configService.get(
      //   'GAMEUSD_POOL_CONTRACT_ADDRESS',
      // );
      // gameUsdTx.receiverAddress = userInfo.referralUser.wallet.walletAddress;
      // gameUsdTx.walletTxs = [walletTx];
      // gameUsdTx.walletTxId = walletTx.id;
      // gameUsdTx.txHash = depositGameUsdTxHash;

      // await queryRunner.manager.save(gameUsdTx);

      // const referralTxInsertResult = await queryRunner.manager.insert(
      //   ReferralTx,
      //   {
      //     rewardAmount: walletTx.txAmount,
      //     referralType: 'DEPOSIT',
      //     status: 'S',
      //     userId: userInfo.id,
      //     walletTx: walletTx,
      //     referralUserId: userInfo.referralUserId, //one who receives the referral amount
      //     referralUser: walletTx.userWallet.user,
      //   },
      // );
      // console.log('referralTx', referralTxInsertResult);
      // await this.handleReferralDepositXp(depositAmount, walletTx, queryRunner);
      // console.log('handle referral deposit xp');
      // console.log('referral walletTx', walletTx)

      // create pointTx
      const referrerXp = this.pointService.getReferralDepositXp(
        Number(depositAmount),
      );
      const lastValidPointTx = await queryRunner.manager.findOne(PointTx, {
        where: {
          walletId: userInfo.referralUser.wallet.id,
        },
        order: {
          createdDate: 'DESC',
        },
      });
      const pointTx = new PointTx();
      pointTx.txType = 'REFERRAL';
      pointTx.amount = referrerXp;
      pointTx.startingBalance = lastValidPointTx?.endingBalance || 0;
      pointTx.endingBalance =
        Number(pointTx.startingBalance) + Number(pointTx.amount);
      pointTx.walletId = userInfo.referralUser.wallet.id;
      pointTx.userWallet = userInfo.referralUser.wallet;
      await queryRunner.manager.save(pointTx);
      console.log('pointTx in handleReferralFlow():', pointTx);

      // update userWallet pointBalance
      userInfo.referralUser.wallet.pointBalance = pointTx.endingBalance;
      await queryRunner.manager.save(userInfo.referralUser.wallet);

      await queryRunner.commitTransaction();

    } catch (error) {
      console.error('Error in referral tx', error);
      await queryRunner.rollbackTransaction();

      // inform admin
      this.adminNotificationService.setAdminNotification(
        `Error processing referral tx for gameUsdTx: ${gameUsdTxId}`,
        'REFERRAL_TX_ERROR',
        'Referral Tx Error',
        false,
      );
      
    } finally {
      await queryRunner.release();
    }
  }

  // private async handleReferralDepositXp(
  //   depositAmount: number,
  //   walletTx: WalletTx,
  //   queryRunner: QueryRunner,
  // ) {
  //   console.log('handle referral deposit xp');
  //   // console.log('referral walletTx', walletTx)
  //   const referrerXp = this.pointService.getReferralDepositXp(
  //     Number(depositAmount),
  //   );

  //   const lastValidPointTx = await queryRunner.manager.findOne(PointTx, {
  //     where: {
  //       walletId: walletTx.userWallet.id,
  //     },
  //     order: {
  //       createdDate: 'DESC',
  //     },
  //   });
  //   const pointTx = new PointTx();
  //   pointTx.amount = referrerXp;
  //   pointTx.txType = 'REFERRAL';
  //   pointTx.walletId = walletTx.userWallet.id;
  //   pointTx.userWallet = walletTx.userWallet;
  //   pointTx.walletTx = walletTx;
  //   pointTx.startingBalance = lastValidPointTx?.endingBalance || 0;
  //   pointTx.endingBalance =
  //     Number(pointTx.startingBalance) + Number(pointTx.amount);

  //   walletTx.userWallet.pointBalance = pointTx.endingBalance;

  //   await queryRunner.manager.save(pointTx);
  //   await queryRunner.manager.save(walletTx.userWallet);
  // }

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

  // transfer deposited token to escrow wallet
  @Cron(CronExpression.EVERY_5_SECONDS)
  async handleEscrowTx() {
    console.log('start handleEscrowTx()');
    const release = await this.cronMutex.acquire();
    console.log('continue handleEscrowTx()');

    try {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      
      const pendingDepositTxns = await queryRunner.manager
        .createQueryBuilder('deposit_tx', 'depositTx')
        .innerJoinAndSelect('depositTx.walletTx', 'walletTx')
        .innerJoinAndSelect('walletTx.userWallet', 'userWallet')
        .where('depositTx.status = :status', { status: 'P' })
        .orderBy('depositTx.id', 'ASC')
        .getMany();
      console.log('pendingDepositTxns', pendingDepositTxns);

      for (const depositTx of pendingDepositTxns) {
        console.log('Processing transfer deposited token to escrow wallet, depositTx.id:', depositTx.id);

        if (depositTx.retryCount >= 5) {
          // retry 5 times already, set status to F and won't enter handleEscrowTx() again
          depositTx.status = 'F';
          await this.depositRepository.save(depositTx);
          // inform admin
          await this.adminNotificationService.setAdminNotification(
            `Transaction to escrow failed after 5 times for depositTx.entity: ${depositTx.id}`,
            'ESCROW_FAILED_5_TIMES',
            'Transfer to Escrow Failed',
            false,
            false,
            depositTx.walletTxId,
          );
          continue;
        }

        // const queryRunner = this.dataSource.createQueryRunner();
        // await queryRunner.connect();
        // await queryRunner.startTransaction();

        try {
          // TODO: if get private key failed, depositTx.status = 'F' and won't enter this handleEscrowTx() again. This issue is caused by gas.reload in processDeposit().
          const userWallet = await this.getUserWallet(depositTx.walletTx.userWalletId);
          const userSigner = await this.getSigner(
            userWallet.walletAddress,
            depositTx.chainId,
          );
          const tokenContract = await this.getTokenContract(
            depositTx.currency,
            userSigner,
          );

          // TODO: get escrow address based on chainId
          const escrowAddress = this.configService.get('ESCROW_ADDRESS');

          try {
            const depositAmount = parseUnits(
              depositTx.walletTx.txAmount.toString(),
              await tokenContract.decimals(),
            );

            // transfer user deposit token to escrow wallet
            const onchainEscrowTx = await this.transferToken(
              tokenContract,
              escrowAddress,
              depositAmount,
            );

            const receipt = await onchainEscrowTx.wait(1);
            const onchainEscrowTxHash = onchainEscrowTx.hash;

            // reload user wallet that execute token transfer if needed
            this.eventEmitter.emit(
              'gas.service.reload',
              userWallet.walletAddress,
              depositTx.chainId,
            );

            if (receipt && receipt.status == 1) {
              // transfer token transaction success
              depositTx.isTransferred = true;
              depositTx.status = 'S';
              depositTx.txHash = onchainEscrowTxHash;
              await queryRunner.manager.save(depositTx);
              console.log('depositTx in handleEscrowTx():', depositTx)

              const gameUsdTx = new GameUsdTx();
              gameUsdTx.amount = depositTx.walletTx.txAmount;
              gameUsdTx.chainId = +this.configService.get('GAMEUSD_CHAIN_ID');
              gameUsdTx.status = 'P';
              gameUsdTx.senderAddress = this.configService.get(
                'GAMEUSD_POOL_CONTRACT_ADDRESS',
              );
              gameUsdTx.receiverAddress = userWallet.walletAddress;
              gameUsdTx.walletTxId = depositTx.walletTx.id;
              gameUsdTx.walletTxs = [depositTx.walletTx];
              await queryRunner.manager.save(gameUsdTx);
              console.log('gameUsdTx in handleEscrowTx():', gameUsdTx)

            } else if (receipt && receipt.status != 1) {
              // transfer token transaction failed
              depositTx.retryCount += 1;
              depositTx.txHash = onchainEscrowTxHash;
              await queryRunner.manager.save(depositTx);
            }

          } catch (error) {
            // common error is user wallet haven't been reloaded yet in processDeposit() event
            // especially new created wallet
            console.log('Error when try to execute on-chain transfer, will retry again', error);
            continue
          }

          // console.log(
          //   'receipt',
          //   receipt,
          //   'onchainEscrowTxHash',
          //   onchainEscrowTxHash,
          // );

          await queryRunner.commitTransaction();

        } catch (err) {
          console.log('Error transfer deposited token to escrow wallet ', err);
          await queryRunner.rollbackTransaction();

          // inform admin
          await this.adminNotificationService.setAdminNotification(
            `Error transfer deposited token to escrow wallet: ${err}`,
            'ESCROW_FAILED',
            'Transfer to Escrow Failed',
            false,
            false,
            depositTx.walletTxId,
          );

          // unknown issue, wait developer to check
          // set status to F and won't enter this handleEscrowTx() again
          depositTx.status = 'F';
          this.depositRepository.save(depositTx);

        } finally {
          await queryRunner.release();
        }
      }

    } catch (error) {
      console.error(error);

      await this.adminNotificationService.setAdminNotification(
        error,
        'UNKNOWN_FAILURE',
        'Unknown failure in handleEscrowTx()',
        false,
        false,
      );
      
    } finally {
      release();
    }
    console.log('end handleEscrowTx()');
  }

  // async wait(ms: number) {
  //   return new Promise((resolve) => setTimeout(resolve, ms));
  // }

  // transfer GameUSD to user wallet
  private handleGameUsdTxInProcess = false;
  @Cron(CronExpression.EVERY_5_SECONDS)
  async handleGameUsdTx() {
    if (this.handleGameUsdTxInProcess) return;
    this.handleGameUsdTxInProcess = true;
    // try {
      const pendingGameUsdTxs = await this.getPendingGameUsdTx();

      for (const gameUsdTx of pendingGameUsdTxs) {
        // try {
          console.log('Processing transfer GameUSD to user wallet, gameUsdTx:', gameUsdTx);

          if (gameUsdTx.retryCount >= 5) {
            await this.updateGameUsdTxToFailed(gameUsdTx);
            continue;
          }

          const isTxSuccess = await this.handleOnChainDeposit(gameUsdTx);
          if (!isTxSuccess) continue;

          // handles the db part of gameUsdTx sent to user address.
          await this.handleGameUSDTxHash(gameUsdTx.id);
          console.log('done processing gameUSD gameUsdTx', gameUsdTx.id);

    //     } catch (error) {
    //       console.log('Error in cron gameUSD gameUsdTx', error);
    //     }
      // }

    // } catch (error) {
    //   console.error('Error in gameUSD gameUsdTx: releasing mutex', error);

    }
    this.handleGameUsdTxInProcess = false;
    // console.log('handleGameUsdTxInProcess', this.handleGameUsdTxInProcess);
    // console.log('handleGameUsdTx() end')
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
    return await this.gameUsdTxRepository
      .createQueryBuilder('gameUsdTx')
      .where('gameUsdTx.status = :status', { status: 'P' })
      .andWhere('gameUsdTx.senderAddress IN (:...senderAddresses)', {
        senderAddresses: [
          // this.configService.get('DEPOSIT_BOT_ADDRESS'),
          this.configService.get('GAMEUSD_POOL_CONTRACT_ADDRESS'),
        ],
      })
      .andWhere('gameUsdTx.creditWalletTx IS NULL')
      .orderBy('gameUsdTx.id', 'ASC')
      .getMany();
    // return await this.gameUsdTxRepository.find({
    //   where: {
    //     status: 'P',
    //     senderAddress: In([
    //       this.configService.get('DEPOSIT_BOT_ADDRESS'),
    //       this.configService.get('GAMEUSD_POOL_CONTRACT_ADDRESS'),
    //     ]),
    //     creditWalletTx: null,
    //   },
    //   order: {
    //     id: 'ASC',
    //   },
    // });
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
      false,
      tx.walletTxId,
    );
  }

  //handles the onchain-transfer of gameUsd to user address.
  private async handleOnChainDeposit(gameUsdTx: GameUsdTx): Promise<boolean> {
    try {
      const depositAdminWallet = await this.getSigner(
        this.configService.get('DEPOSIT_BOT_ADDRESS'),
        gameUsdTx.chainId,
      );
      const onchainGameUsdTx = await this.depositGameUSD(
        gameUsdTx.receiverAddress,
        parseEther(gameUsdTx.amount.toString()),
        depositAdminWallet,
      );

      this.eventEmitter.emit(
        'gas.service.reload',
        await depositAdminWallet.getAddress(),
        gameUsdTx.chainId,
      );

      gameUsdTx.txHash = onchainGameUsdTx.hash;
      const txReceipt = await onchainGameUsdTx.wait(1);
      if (txReceipt && txReceipt.status == 1) {
        // transfer GameUSD transaction success
        gameUsdTx.status = 'S';

      } else {
        // transfer GameUSD transaction failed, try again later
        gameUsdTx.retryCount += 1;
        return false
      }

      return true;

    } catch (error) {
      console.log('Error in handleOnChainDeposit():', error);
      gameUsdTx.retryCount += 1;
      return false;

    } finally {
      await this.gameUsdTxRepository.save(gameUsdTx);
      console.log('gameUsdTx in handleOnChainDeposit()', gameUsdTx)
    }
  }

  // handles the db part of gameUsdTx sent to user address.
  // won't proceed here if handleOnChainDeposit() return false
  private async handleGameUSDTxHash(gameUsdTxId: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const gameUsdTx = await queryRunner.manager.findOne(GameUsdTx, {
        where: { id: gameUsdTxId },
      });
      // const depositTxHash = gameUsdTx.txHash;
      // const provider = this.getProvider(gameUsdTx.chainId);
      // const receipt = await provider.getTransactionReceipt(depositTxHash);
      const walletTx = await this.getWalletTx(gameUsdTx.walletTxId);

      // console.log('Deposit tx success', depositTxHash);
      // gameUsdTx.status = 'S';

      // update walletTx
      const previousWalletTx = await this.lastValidWalletTx(
        walletTx.userWalletId,
      );
      walletTx.status = 'S';
      walletTx.startingBalance = previousWalletTx?.endingBalance || 0;
      walletTx.endingBalance =
        (Number(previousWalletTx?.endingBalance) || 0) +
        Number(gameUsdTx.amount);
      await queryRunner.manager.save(walletTx);
      console.log('walletTx in handleGameUSDTxHash()', walletTx)

      // update userWallet walletBalance
      walletTx.userWallet.walletBalance = walletTx.endingBalance;

      // create user pointTx
      const pointInfo = this.pointService.getDepositPoints(
        Number(walletTx.txAmount),
      );
      const lastValidPointTx = await this.lastValidPointTx(
        walletTx.userWallet.id,
      );
      const pointTxAmount =
        pointInfo.xp + (walletTx.txAmount * pointInfo.bonusPerc) / 100;
      const pointTxStartingBalance = lastValidPointTx?.endingBalance || 0;
      const pointTxEndingBalance =
        Number(pointTxStartingBalance) + Number(pointTxAmount);
      const pointTx = new PointTx();
      pointTx.txType = 'DEPOSIT';
      pointTx.amount = pointTxAmount;
      pointTx.startingBalance = pointTxStartingBalance;
      pointTx.endingBalance = pointTxEndingBalance;
      pointTx.walletId = walletTx.userWallet.id;
      pointTx.userWallet = walletTx.userWallet;
      pointTx.walletTxId = walletTx.id;
      pointTx.walletTx = walletTx;
      await queryRunner.manager.save(pointTx);
      console.log('pointTx in handleGameUSDTxHash()', pointTx)

      // update userWallet pointBalance
      walletTx.userWallet.pointBalance = pointTxEndingBalance;
      await queryRunner.manager.save(walletTx.userWallet);
      console.log('userWallet in handleGameUSDTxHash()', walletTx.userWallet)
      
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
        gameUsdTx.txHash,
      );

    } catch (error) {
      console.log('Error in gameUSD tx ', error);
      await queryRunner.rollbackTransaction();

      // inform admin about the error
      await this.adminNotificationService.setAdminNotification(
        `Error in handleGameUSDTxHash(), error: ${error}`,
        'UNKNOWN ERROR',
        'Error in handleGameUSDTxHash()',
        false,
        false,
      );

    } finally {
      await queryRunner.release();
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
