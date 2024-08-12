import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, Repository } from 'typeorm';
import { UserWallet } from '../entities/user-wallet.entity';
import { WalletTx } from '../entities/wallet-tx.entity';
import { ethers } from 'ethers';
import { GameUSD__factory, Payout__factory } from 'src/contract';
import { RedeemDto } from '../dto/redeem.dto';
import { RedeemTx } from '../entities/redeem-tx.entity';
import { UserNotification } from 'src/notification/entities/user-notification.entity';
import { Notification } from 'src/notification/entities/notification.entity';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { GameUsdTx } from '../entities/game-usd-tx.entity';
import { Admin } from 'src/admin/entities/admin.entity';
import { Setting } from 'src/setting/entities/setting.entity';
import { ReviewRedeemDto } from '../dto/ReviewRedeem.dto';
import { User } from 'src/user/entities/user.entity';
import { Cron } from '@nestjs/schedule';
import { WalletService } from '../wallet.service';
import { UserService } from 'src/user/user.service';
import { MPC } from 'src/shared/mpc';
import * as dotenv from 'dotenv';
dotenv.config();

type RedeemResponse = {
  error: string;
  data: any;
};

type RequestRedeemEvent = {
  userId: number;
  txHash: string;
  walletTxId: number;
  redeemTxId: number;
  gameUsdTxId: number;
};

@Injectable()
export class WithdrawService {
  provider = new ethers.JsonRpcProvider(process.env.OPBNB_PROVIDER_RPC_URL);

  constructor(
    @InjectRepository(UserWallet)
    private userWalletRepository: Repository<UserWallet>,
    @InjectRepository(WalletTx)
    private walletTxRepository: Repository<WalletTx>,
    @InjectRepository(RedeemTx)
    private redeemTxRepository: Repository<RedeemTx>,
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(UserNotification)
    private userNotificationRepository: Repository<UserNotification>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Admin)
    private adminRepository: Repository<Admin>,
    @InjectRepository(GameUsdTx)
    private gameUsdTxRepository: Repository<GameUsdTx>,
    @InjectRepository(Setting)
    private settingRepository: Repository<Setting>,
    private dataSource: DataSource,
    private adminNotificationService: AdminNotificationService,
    private walletService: WalletService,
    private eventEmitter: EventEmitter2,
    private userService: UserService,
  ) {}

  // how redeem & payout work
  // 1. user request redeem via /request-redeem
  // 2. if redeem < $100, proceed with reviewRedeem(). else, pending admin to execute reviewRedeem()
  // 3. local server redeem bot run every 5 minutes to check if any pending redeem request,
  // generate signature for the redeem request & update directly through backend database
  // 4. payout() run every 5 minutes to execute payout if any

  async requestRedeem(
    userId: number,
    payload: RedeemDto,
  ): Promise<RedeemResponse> {
    const userWallet = await this.userWalletRepository.findOneBy({ userId });

    // check if user has sufficient amount for redeem
    if (userWallet.walletBalance < payload.amount) {
      return {
        error: 'Insufficient redeemable balance',
        data: null,
      };
    }

    // check if user has sufficient level to redeem
    const userLevel = this.walletService.calculateLevel(
      userWallet.pointBalance,
    );
    if (userLevel < 10) {
      return {
        error: 'Insufficient level to redeem',
        data: null,
      };
    }

    // check if there is any pending redeem
    const lastRedeemWalletTx = await this.walletTxRepository.findOne({
      where: [
        {
          txType: 'REDEEM',
          userWalletId: userId,
          status: 'P',
        },
        {
          txType: 'REDEEM',
          userWalletId: userId,
          status: 'PD',
        },
        {
          txType: 'REDEEM',
          userWalletId: userId,
          status: 'PA',
        },
      ],
    });
    if (lastRedeemWalletTx) {
      return { error: 'Redeem is in pending', data: null };
    }

    // create redeemTx
    const setting = await this.settingRepository.findOneBy({
      key: `WITHDRAWAL_FEES_${payload.chainId}`,
    });
    const redeemTx = this.redeemTxRepository.create({
      payoutNote: null,
      payoutCanProceed: null,
      payoutCheckedAt: null,
      payoutSignature: null,
      payoutTxHash: null,
      payoutStatus: null,
      fromAddress: null,
      receiverAddress: payload.receiverAddress,
      isPayoutTransferred: false,
      chainId: payload.chainId,
      fees: Number(setting.value),
      tokenSymbol: payload.tokenSymbol,
      tokenAddress: payload.tokenAddress,
      amount: payload.amount,
      amountInUSD: payload.amount, // 1:1 hardcoded for now
      reviewedBy: null,
      admin: null,
      walletTx: null,
    });
    await this.redeemTxRepository.save(redeemTx);

    const walletTx = this.walletTxRepository.create({
      txType: 'REDEEM',
      txAmount: payload.amount,
      txHash: null,
      status: 'P', // pending
      startingBalance: null,
      endingBalance: null,
      userWalletId: userWallet.id,
      redeemTx,
      gameUsdTx: null,
    });
    await this.walletTxRepository.save(walletTx);

    // update redeemTx with walletTx
    redeemTx.walletTx = walletTx;
    await this.redeemTxRepository.save(redeemTx);

    // create gameUsdTx
    const gameUsdTx = this.gameUsdTxRepository.create({
      amount: redeemTx.amount,
      chainId: redeemTx.chainId,
      status: 'P', // pending
      txHash: null,
      senderAddress: userWallet.walletAddress,
      receiverAddress: process.env.GAMEUSD_POOL_CONTRACT_ADDRESS,
      retryCount: 0,
      walletTxId: walletTx.id,
    });
    await this.gameUsdTxRepository.save(gameUsdTx);

    // update walletTx with gameUsdTx
    walletTx.gameUsdTx = gameUsdTx;
    await this.walletTxRepository.save(walletTx);

    // start queryRunner
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // check if Payout contract has sufficient USDT to payout for requested amount based on the chainId
      let usdt_balance: bigint;
      if (payload.chainId === 56) {
        const _provider = new ethers.JsonRpcProvider(
          process.env.BNB_PROVIDER_RPC_URL,
        );
        const usdt_token_contract = GameUSD__factory.connect(
          // borrow interface from GameUSD token contract
          process.env.BNB_USDT_TOKEN_ADDRESS,
          _provider,
        );
        usdt_balance = await usdt_token_contract.balanceOf(
          process.env.BNB_PAYOUT_POOL_CONTRACT_ADDRESS,
        );
      } else {
        const _provider = new ethers.JsonRpcProvider(
          process.env.OPBNB_PROVIDER_RPC_URL,
        );
        const usdt_token_contract = GameUSD__factory.connect(
          process.env.OPBNB_USDT_TOKEN_ADDRESS,
          _provider,
        );
        usdt_balance = await usdt_token_contract.balanceOf(
          process.env.OPBNB_PAYOUT_POOL_CONTRACT_ADDRESS,
        );
      }

      if (Number(usdt_balance) < payload.amount) {
        // send notification to admin for reload payout pool
        this.adminNotificationService.setAdminNotification(
          `Payout contract has insufficient USDT to payout for amount $${payload.amount}. Please reload payout pool.`,
          'error',
          'Payout Pool Reload',
          true,
        );
      }

      // proceed for bot payout if requested amount < $100 & last payout < 24 hours
      const lastRedeemWalletTx = await this.walletTxRepository.findOne({
        where: {
          userWalletId: userId,
          txType: 'REDEEM',
          status: 'S',
        },
        order: { updatedDate: 'DESC' },
      });
      if (
        payload.amount < 100 &&
        (lastRedeemWalletTx === null || // first redeem
          lastRedeemWalletTx.updatedDate <
            new Date(Date.now() - 24 * 60 * 60 * 1000)) &&
        // proceed for bot payout only if usdt_balance is sufficient
        usdt_balance > payload.amount
      ) {
        const adminId = 999; // means this request redeem is done automatically(criteria met)
        const payload: ReviewRedeemDto = {
          redeemTxId: redeemTx.id,
          payoutCanProceed: true,
          payoutNote: 'This request redeem proceed automatically(criteria met)',
        };
        this.reviewRedeem(adminId, payload);
      } else {
        // requested amount > $100 or last payout < 24 hours
        walletTx.status = 'PA'; // pending for admin review
        await queryRunner.manager.save(walletTx);

        // send notification to admin for manual review
        this.adminNotificationService.setAdminNotification(
          `User ${userId} has requested redeem for amount $${payload.amount}, please review. redeemTxId: ${redeemTx.id}`,
          'info',
          'Redeem Request',
          true,
        );
      }

      await queryRunner.commitTransaction();
    } catch (err) {
      // rollback queryRunner
      await queryRunner.rollbackTransaction();
      // inform admin for rollback transaction
      await this.adminNotificationService.setAdminNotification(
        `Transaction in redeem.service.requestRedeem had been rollback, error: ${err}`,
        'rollbackTxError',
        'Transaction Rollbacked',
        true,
      );
      return { error: err, data: null };
    } finally {
      // finalize queryRunner
      await queryRunner.release();

      // update userWallet
      userWallet.walletBalance -= walletTx.txAmount;
      // userWallet.redeemableBalance -= walletTx.txAmount;
      await this.userWalletRepository.save(userWallet);

      await this.userService.setUserNotification(userId, {
        type: 'redeem',
        title: 'Redeem Processed Successfully',
        message: `Your redeem of $${payload.amount} has been successfully processed and pending for review.`,
        walletTxId: walletTx.id,
      });
    }

    return { error: null, data: redeemTx };
  }

  async reviewRedeem(adminId: number, payload: ReviewRedeemDto) {
    // fetch redeemTx from redeemTxId
    const redeemTx = await this.redeemTxRepository.findOne({
      where: { id: payload.redeemTxId },
      relations: { walletTx: true },
    });

    // check if redeemTx exists
    if (redeemTx === null) {
      return {
        error: `redeemTxId: ${payload.redeemTxId} not found`,
        data: null,
      };
    }

    const walletTx = await this.walletTxRepository.findOne({
      where: { id: redeemTx.walletTx.id },
      relations: { userWallet: true },
    });

    // check if this redeemTx is already reviewed
    if (redeemTx.reviewedBy !== null) {
      return {
        error: `This redeem request is already reviewed by admin id: ${redeemTx.reviewedBy}`,
        data: null,
      };
    }

    // start queryRunner
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // update redeemTx
      redeemTx.payoutNote = payload.payoutNote;
      redeemTx.payoutCheckedAt = new Date();
      redeemTx.reviewedBy = adminId;
      redeemTx.admin =
        adminId === 999 // system auto payout
          ? null
          : await this.adminRepository.findOneBy({ id: adminId });
      await queryRunner.manager.save(redeemTx);

      if (payload.payoutCanProceed) {
        // update walletTx
        walletTx.status = 'P';
        await queryRunner.manager.save(walletTx);

        // check if userWallet did max approval on redeem contract
        const userWallet = walletTx.userWallet;
        const signer = new ethers.Wallet(
          await MPC.retrievePrivateKey(userWallet.walletAddress),
          this.provider,
        );
        const redeemTxCount = await this.redeemTxRepository.count();
        if (redeemTxCount === 1) {
          // first redeem request, approve max amount to redeem contract
          const gameUsdTokenContract = GameUSD__factory.connect(
            process.env.GAMEUSD_CONTRACT_ADDRESS,
            signer,
          );
          const txResponse = await gameUsdTokenContract.approve(
            process.env.REDEEM_CONTRACT_ADDRESS,
            ethers.MaxUint256,
            { gasLimit: 100000 }, // increased by ~30% from actual gas used
          );
          await txResponse.wait();

          // check native token balance for user wallet
          this.eventEmitter.emit(
            'gas.service.reload',
            userWallet.walletAddress,
            Number(process.env.OPBNB_CHAIN_ID),
          );
        }

        // TODO: to migrate to withdraw
        // execute redeem() on Redeem contract
        // const redeemContract = Redeem__factory.connect(process.env.REDEEM_CONTRACT_ADDRESS, signer);
        // const txResponse = await redeemContract.redeem(
        //   ethers.parseEther(Number(redeemTx.amount).toString()),
        //   redeemTx.receiverAddress,
        //   { gasLimit: 100000 } // increased by ~30% from actual gas used
        // );

        // // check native token balance for user wallet
        // this.eventEmitter.emit(
        //   'gas.service.reload',
        //   userWallet.walletAddress,
        //   Number(process.env.OPBNB_CHAIN_ID),
        // );

        // // update txHash for walletTx & gameUsdTx
        // // this txHash might be in pending, is success, is failed, or is disappeared(in very rare case)
        // walletTx.txHash = txResponse.hash;
        // await queryRunner.manager.save(walletTx);
        // const gameUsdTx = await this.gameUsdTxRepository.findOneBy({ walletTxId: walletTx.id });
        // gameUsdTx.txHash = txResponse.hash;
        // await queryRunner.manager.save(gameUsdTx);

        // // pass to handleClaimEvent() to check & update database
        // const eventPayload: RequestRedeemEvent = {
        //   userId: userWallet.userId,
        //   txHash: txResponse.hash,
        //   walletTxId: walletTx.id,
        //   redeemTxId: redeemTx.id,
        //   gameUsdTxId: gameUsdTx.id,
        // }
        // this.eventEmitter.emit('wallet.handleRedeem', eventPayload);

        // need to commit transaction before setUserNotification() to avoid deadlock(QueryFailedError)
        await queryRunner.commitTransaction();

        // inform user for approved redeem request (not through queryRunner)
        await this.userService.setUserNotification(walletTx.userWalletId, {
          type: 'review redeem',
          title: 'Redeem Request Approved',
          message: `Your redeem request for amount $${Number(walletTx.txAmount)} has been approved. Please wait for the payout process.`,
          walletTxId: walletTx.id,
        });
      } else {
        // !payload.canApprove
        // update redeemTx
        redeemTx.payoutCanProceed = false;
        await queryRunner.manager.save(redeemTx);

        // update walletTx
        walletTx.status = 'F';
        await queryRunner.manager.save(walletTx);

        // inform user for rejected redeem request (not through queryRunner)
        await this.userService.setUserNotification(walletTx.userWalletId, {
          type: 'review redeem',
          title: 'Redeem Request Rejected',
          message: `Your redeem request for amount $${Number(walletTx.txAmount)} has been rejected. Please contact admin for more information.`,
          walletTxId: walletTx.id,
        });

        await queryRunner.commitTransaction();
      }
    } catch (err) {
      // rollback queryRunner
      await queryRunner.rollbackTransaction();

      // update walletTx
      walletTx.status = 'PD';
      await this.walletTxRepository.save(walletTx);

      // inform admin for rollback transaction
      await this.adminNotificationService.setAdminNotification(
        `Transaction in redeem.service.reviewRedeem had been rollback, please check. Error: ${err}`,
        'rollbackTxError',
        'Transaction Rollbacked',
        true,
        false,
        walletTx.id,
      );

      return { error: `transaction rollback, error: ${err}`, data: null };
    } finally {
      // finalize queryRunner
      await queryRunner.release();
    }

    return { error: null, data: { redeemTx: redeemTx, walletTx: walletTx } };
  }

  @OnEvent('wallet.handleRedeem', { async: true })
  async handleRedeemEvent(payload: RequestRedeemEvent) {
    // fetch txResponse from hash and wait for txReceipt
    const txResponse = await this.provider.getTransaction(payload.txHash);
    const txReceipt = await txResponse.wait();

    // start queryRunner
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const redeemTx = await this.redeemTxRepository.findOneBy({
        id: payload.redeemTxId,
      });
      const walletTx = await this.walletTxRepository.findOne({
        where: { id: payload.walletTxId },
        relations: { userWallet: true },
      });
      const gameUsdTx = await this.gameUsdTxRepository.findOneBy({
        id: payload.gameUsdTxId,
      });

      if (txReceipt.status === 1) {
        // Redeem.redeem() success
        // update redeemTx
        redeemTx.payoutCanProceed = true;
        redeemTx.payoutStatus = 'P'; // pending
        await queryRunner.manager.save(redeemTx);

        // update walletTx
        // note: walletTx.status = 'S' only after payout tx is success
        const lastWalletTx = await this.walletTxRepository.findOne({
          where: {
            userWalletId: payload.userId,
            status: 'S',
          },
          order: { updatedDate: 'DESC' },
        });
        // lastWalletTx never be null because there must be claim walletTx before redeem
        walletTx.startingBalance = lastWalletTx.endingBalance;
        walletTx.endingBalance =
          Number(walletTx.startingBalance) - Number(walletTx.txAmount);
        await queryRunner.manager.save(walletTx);

        // update gameUsdTx
        gameUsdTx.status = 'S';
        gameUsdTx.txHash = txReceipt.hash;
        await this.gameUsdTxRepository.save(gameUsdTx);

        // update wallet_tx
        walletTx.status = 'S';
        await queryRunner.manager.save(walletTx);

        await queryRunner.commitTransaction();
      } else {
        // txReceipt.status === 0, Redeem.redeem() failed
        // update walletTx
        walletTx.status = 'PD';
        await queryRunner.manager.save(walletTx);

        // update gameUsdTx
        gameUsdTx.status = 'F';
        gameUsdTx.txHash = txReceipt.hash;
        await this.gameUsdTxRepository.save(gameUsdTx);

        // inform admin for failed on-chain redeem tx
        await this.adminNotificationService.setAdminNotification(
          `redeem() of Redeem contract failed, please check. Tx hash: ${txReceipt.hash}`,
          'onChainTxError',
          'Redeem Failed',
          true,
          false,
          walletTx.id,
        );
      }
    } catch (err) {
      // rollback queryRunner
      await queryRunner.rollbackTransaction();

      // update walletTx
      const walletTx = await this.walletTxRepository.findOneBy({
        id: payload.walletTxId,
      });
      walletTx.status = 'PD';
      await queryRunner.manager.save(walletTx);

      // inform admin for rollback transaction
      await this.adminNotificationService.setAdminNotification(
        `Transaction in redeem.service.handleRequestRedeemEvent had been rollback, error: ${err}`,
        'rollbackTxError',
        'Transaction Rollbacked',
        true,
        false,
        payload.walletTxId,
      );
    } finally {
      // finalize queryRunner
      await queryRunner.release();
    }
  }

  @Cron('0 */5 * * * *', { utcOffset: 0 }) // every 5 minutes
  async payout(): Promise<void> {
    // fetch redeemTx
    const redeemTxs = await this.redeemTxRepository.find({
      where: {
        payoutSignature: Not(IsNull()),
        payoutTxHash: IsNull(),
        payoutStatus: 'P',
        isPayoutTransferred: false,
        reviewedBy: Not(IsNull()),
      },
      relations: { walletTx: true },
    });

    for (const redeemTx of redeemTxs) {
      const walletTx = await this.walletTxRepository.findOne({
        where: { id: redeemTx.walletTx.id },
      });

      // start queryRunner
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        const amountAfterFees = Number(redeemTx.amount) - Number(redeemTx.fees);
        const destinationAddress = redeemTx.receiverAddress;

        // interact with Payout Pool contract
        const chain_provider_url =
          redeemTx.chainId === 56
            ? process.env.BNB_PROVIDER_RPC_URL
            : process.env.OPBNB_PROVIDER_RPC_URL;
        const chain_provider = new ethers.JsonRpcProvider(chain_provider_url);
        const payoutBot = new ethers.Wallet(
          await MPC.retrievePrivateKey(process.env.PAYOUT_BOT_ADDRESS),
          chain_provider,
        );
        const payoutPoolContractAddress =
          redeemTx.chainId === 56
            ? process.env.BNB_PAYOUT_POOL_CONTRACT_ADDRESS
            : process.env.OPBNB_PAYOUT_POOL_CONTRACT_ADDRESS;
        const payoutPoolContract = Payout__factory.connect(
          payoutPoolContractAddress,
          payoutBot,
        );
        const txResponse = await payoutPoolContract.payout(
          ethers.parseEther(amountAfterFees.toString()),
          destinationAddress,
          redeemTx.payoutSignature,
          { gasLimit: 120000 }, // increased by ~30% from actual gas used
        );
        const txReceipt = await txResponse.wait();

        // check native token balance for payout bot
        this.eventEmitter.emit(
          'gas.service.reload',
          payoutBot.address,
          redeemTx.chainId,
        );

        // update signature, txHash & fromAddress for redeemTx
        redeemTx.payoutTxHash = txReceipt.hash;
        redeemTx.fromAddress = payoutBot.address;
        await queryRunner.manager.save(redeemTx);

        if (txReceipt.status === 1) {
          // on-chain transaction success
          // update redeemTx
          redeemTx.isPayoutTransferred = true;
          redeemTx.payoutStatus = 'S';
          await queryRunner.manager.save(redeemTx);

          // update walletTx
          walletTx.status = 'S';
          await queryRunner.manager.save(walletTx);

          // send notification to user for successful payout (not through queryRunner)
          await this.userService.setUserNotification(walletTx.userWalletId, {
            type: 'payout',
            title: 'Payout Successfully',
            message: `Your payout for amount $${Number(redeemTx.amount)} has been processed successfully.`,
            walletTxId: walletTx.id,
          });
        } else {
          // txReceipt.status === 0, on-chain transaction failed
          // update redeemTx
          redeemTx.isPayoutTransferred = false;
          await queryRunner.manager.save(redeemTx);

          // update walletTx
          const walletTx = redeemTx.walletTx;
          walletTx.status = 'PD';
          await queryRunner.manager.save(walletTx);

          // send notification to admin to check for failed payout
          await this.adminNotificationService.setAdminNotification(
            `Payout for redeemTxId ${redeemTx.id} has failed. Please check.`,
            'error',
            'Payout Failed',
            true,
            false,
            walletTx.id,
          );
        }

        await queryRunner.commitTransaction();
      } catch (err) {
        // rollback queryRunner
        await queryRunner.rollbackTransaction();

        // update walletTx
        walletTx.status = 'PD';
        await this.walletTxRepository.save(walletTx);

        // inform admin for rollback transaction
        await this.adminNotificationService.setAdminNotification(
          `Transaction in redeem.service.payout had been rollback, error: ${err}`,
          'rollbackTxError',
          'Transaction Rollbacked',
          true,
          false,
          walletTx.id,
        );
      } finally {
        // finalize queryRunner
        await queryRunner.release();
      }
    }
  }
}
