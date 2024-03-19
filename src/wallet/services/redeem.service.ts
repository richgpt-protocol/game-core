import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Game } from 'src/game/entities/game.entity';
import { DataSource, IsNull, Repository } from 'typeorm';
import { ClaimDto } from '../dto/claim.dto';
import { UserWallet } from '../entities/user-wallet.entity';
import { ClaimDetail } from '../entities/claim-detail.entity';
import { BetOrder } from 'src/game/entities/bet-order.entity';
import { WalletTx } from '../entities/wallet-tx.entity';
import { DrawResult } from 'src/game/entities/draw-result.entity';
import { ethers } from 'ethers';
import { Core__factory, GameUSD__factory, Payout__factory, Redeem__factory } from 'src/contract';
import { ICore } from 'src/contract/Core';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { RedeemDto } from '../dto/redeem.dto';
import { RedeemTx } from '../entities/redeem-tx.entity';
import { UserNotification } from 'src/notification/entities/user-notification.entity';
import { Notification } from 'src/notification/entities/notification.entity';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { GameUsdTx } from '../entities/game-usd-tx.entity';
import { Admin } from 'src/admin/entities/admin.entity';
import { RedeemedEvent } from 'src/contract/Redeem';
import { Setting } from 'src/setting/entities/setting.entity';
import { PayoutDto } from '../dto/payout.dto';
import { ReviewRedeemDto } from '../dto/ReviewRedeem.dto';
import * as dotenv from 'dotenv';
import { User } from 'src/user/entities/user.entity';
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

type PayoutEvent = {
  txHash: string;
  redeemTxId: number;
}

@Injectable()
export class RedeemService {
  provider = new ethers.JsonRpcProvider(process.env.OPBNB_PROVIDER_RPC_URL);

  constructor(
    @InjectRepository(UserWallet)
    private userWalletRepository: Repository<UserWallet>,
    @InjectRepository(BetOrder)
    private betOrderRepository: Repository<BetOrder>,
    @InjectRepository(Game)
    private gameRepository: Repository<Game>,
    @InjectRepository(ClaimDetail)
    private claimDetailRepository: Repository<ClaimDetail>,
    @InjectRepository(WalletTx)
    private walletTxRepository: Repository<WalletTx>,
    @InjectRepository(DrawResult)
    private drawResultRepository: Repository<DrawResult>,
    @InjectRepository(PointTx)
    private pointTxRepository: Repository<PointTx>,
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
    private eventEmitter: EventEmitter2,
  ) {}

  async requestRedeem(userId: number, payload: RedeemDto): Promise<RedeemResponse> {
    // check if user has sufficient amount for redeem
    const userWallet = await this.userWalletRepository.findOneBy({ userId });
    if (userWallet.redeemableBalance < payload.amount) {
      return {
        error: 'Insufficient redeemable balance',
        data: null,
      };
    }

    // create redeemTx & walletTx
    const setting = await this.settingRepository.findOneBy(
      { key: `WITHDRAWAL_FEES_${payload.chainId}` }
    );
    const redeemTx = this.redeemTxRepository.create({
      payoutNote: null,
      payoutCanProceed: null,
      payoutCheckedAt: null,
      payoutSignature: null,
      payoutTxHash: null,
      payoutStatus: null,
      fromAddress: null,
      receiverAddress: payload.receiverAddress,
      isPayoutTransferred: null,
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

    // start queryRunner
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {

      const walletTx = this.walletTxRepository.create({
        txType: 'REDEEM',
        txAmount: payload.amount,
        txHash: null,
        status: 'P', // pending
        startingBalance: null,
        endingBalance: null,
        userWalletId: userId,
        redeemTx,
        gameUsdTx: null,
      });

      redeemTx.walletTx = walletTx;
      await queryRunner.manager.save([walletTx, redeemTx]);

      // check if Payout contract has sufficient USDT to payout for requested amount
      const usdt_token_contract = GameUSD__factory.connect(
        // borrow interface from GameUSD token contract
        process.env.USDT_TOKEN_ADDRESS,
        this.provider
      );
      const usdt_balance = await usdt_token_contract.balanceOf(
        process.env.PAYOUT_POOL_CONTRACT_ADDRESS
      );
      if (usdt_balance < payload.amount) {
        // send notification to admin for reload payout pool
        this.adminNotificationService.setAdminNotification(
          `Payout contract has insufficient USDT to payout for amount ${payload.amount}. Please reload payout pool.`,
          'error',
          'Payout Pool Reload',
          true
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
        payload.amount < 100
          && (
            lastRedeemWalletTx === null || // first redeem
            lastRedeemWalletTx.updatedDate < new Date(Date.now() - 24 * 60 * 60 * 1000)
          )
          // proceed for bot payout only if usdt_balance is sufficient
          && usdt_balance > payload.amount
      ) {
        const adminId = 999; // means this request redeem is done automatically(criteria met)
        const payload: ReviewRedeemDto = {
          redeemTxId: redeemTx.id,
          payoutCanProceed: true,
          payoutNote: 'This request redeem proceed automatically(criteria met)',
        };
        await this.reviewRedeem(adminId, payload);

      } else {
        // requested amount > $100 or last payout < 24 hours
        walletTx.status = 'PA'; // pending for admin review
        await queryRunner.manager.save(walletTx);

        // send notification to admin for manual review
        this.adminNotificationService.setAdminNotification(
          `User ${userId} has requested redeem for amount ${payload.amount}. Please review.`,
          'info',
          'Redeem Request',
          true
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
        true
      );
      return { error: err, data: null };

    } finally {
      // finalize queryRunner
      await queryRunner.release();
    }

    return { error: null, data: redeemTx };
  }

  async reviewRedeem(adminId: number, payload: ReviewRedeemDto) {
    // fetch redeemTx from redeemTxId
    const redeemTx = await this.redeemTxRepository.findOne({
      where: { id: payload.redeemTxId },
      relations: { walletTx: true }
    });

    // check if redeemTx exists
    if (redeemTx === null) {
      return { error: `redeemTxId: ${payload.redeemTxId} not found`, data: null };
    }

    const walletTx = await this.walletTxRepository.findOne({
      where: { id: redeemTx.walletTx.id },
      relations: { userWallet: true }
    });

    // check if this redeemTx is already reviewed
    if (redeemTx.reviewedBy !== null) {
      return { error: `This redeem request is already reviewed by admin id: ${redeemTx.reviewedBy}`, data: null };
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
      redeemTx.admin = adminId === 999 // system auto payout
        ? null
        : await this.adminRepository.findOneBy({ id: adminId });
      await queryRunner.manager.save(redeemTx);

      if (payload.payoutCanProceed) {
        // update walletTx
        walletTx.status = 'P';
        await queryRunner.manager.save(walletTx);

        // create gameUsdTx
        const gameUsdTx = this.gameUsdTxRepository.create({
          amount: redeemTx.amount,
          chainId: redeemTx.chainId,
          status: 'P', // pending
          txHash: null,
          senderAddress: walletTx.userWallet.walletAddress,
          receiverAddress: process.env.GAMEUSD_POOL_CONTRACT_ADDRESS,
          retryCount: 0,
          walletTxId: walletTx.id,
        });
        await queryRunner.manager.save(gameUsdTx);

        // execute redeem() on Redeem contract
        const userWallet = walletTx.userWallet;
        const signer = new ethers.Wallet(userWallet.privateKey, this.provider) // TEMP: userWallet.privateKey
        const redeemContract = Redeem__factory.connect(process.env.REDEEM_CONTRACT_ADDRESS, signer);
        const txResponse = await redeemContract.redeem(
          ethers.parseEther(Number(redeemTx.amount).toString()),
          redeemTx.receiverAddress,
          { gasLimit: 100000 } // increased by ~30% from actual gas used
        );

        // update txHash for walletTx & gameUsdTx
        // this txHash might be in pending, is success, is failed, or is disappeared(in very rare case)
        walletTx.txHash = txResponse.hash;
        gameUsdTx.txHash = txResponse.hash;
        await queryRunner.manager.save([walletTx, gameUsdTx]);

        // pass to handleClaimEvent() to check & update database
        const eventPayload: RequestRedeemEvent = {
          userId: userWallet.userId,
          txHash: txResponse.hash,
          walletTxId: walletTx.id,
          redeemTxId: redeemTx.id,
          gameUsdTxId: gameUsdTx.id,
        }
        this.eventEmitter.emit('wallet.handleRedeem', eventPayload);

      } else { // !payload.canApprove
        // update redeemTx
        redeemTx.payoutCanProceed = false;
        await queryRunner.manager.save(redeemTx);

        // update walletTx
        walletTx.status = 'F';
        await queryRunner.manager.save(walletTx);

        // inform user for rejected redeem request
        const notification = this.notificationRepository.create({
          type: 'redeemRejectError',
          title: 'Redeem Request Rejected',
          message: `Your redeem request for amount ${walletTx.txAmount} has been rejected. Please contact admin for more information.`,
        });
        const userNotification = this.userNotificationRepository.create({
          notification,
          user: walletTx.userWallet.user,
        });
        await queryRunner.manager.save([notification, userNotification]);
      }

      await queryRunner.commitTransaction();

    } catch (err) {
      // rollback queryRunner
      await queryRunner.rollbackTransaction();

      // update walletTx
      walletTx.status = 'PD';
      await queryRunner.manager.save(walletTx);

      // inform admin for rollback transaction
      await this.adminNotificationService.setAdminNotification(
        `Transaction in redeem.service.reviewRedeem had been rollback, please check. Error: ${err}`,
        'rollbackTxError',
        'Transaction Rollbacked',
        true,
        walletTx.id
      );

      return { error: `transaction rollback, error: ${err}`, data: null };

    } finally {
      // finalize queryRunner
      await queryRunner.release();
    }

    return { error: null, data: { redeemTx: redeemTx, walletTx: walletTx } };
  }

  @OnEvent('wallet.handleRedeem', {async: true})
  async handleRedeemEvent(payload: RequestRedeemEvent) {
    // fetch txResponse from hash and wait for txReceipt
    const txResponse = await this.provider.getTransaction(payload.txHash);
    const txReceipt = await txResponse.wait();

    // start queryRunner
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const redeemTx = await this.redeemTxRepository.findOneBy({ id: payload.redeemTxId });
      const walletTx = await this.walletTxRepository.findOne({
        where: { id: payload.walletTxId },
        relations: { userWallet: true }
      });
      const gameUsdTx = await this.gameUsdTxRepository.findOneBy({ id: payload.gameUsdTxId });

      if (txReceipt.status === 1) { // Redeem.redeem() success
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
        walletTx.endingBalance = Number(walletTx.startingBalance) - Number(walletTx.txAmount);
        await queryRunner.manager.save(walletTx);

        // update gameUsdTx
        gameUsdTx.status = 'S';
        gameUsdTx.txHash = txReceipt.hash;
        await this.gameUsdTxRepository.save(gameUsdTx);

        // update wallet_tx
        walletTx.status = 'S';
        await queryRunner.manager.save(walletTx);

        // update userWallet
        const userWallet = walletTx.userWallet;
        userWallet.walletBalance -= walletTx.txAmount;
        userWallet.redeemableBalance -= walletTx.txAmount;
        await queryRunner.manager.save(userWallet);
        
        await queryRunner.commitTransaction();

      } else { // txReceipt.status === 0, Redeem.redeem() failed
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
          walletTx.id
        );
      }

    } catch (err) {
      // rollback queryRunner
      await queryRunner.rollbackTransaction();

      // update walletTx
      const walletTx = await this.walletTxRepository.findOneBy({ id: payload.walletTxId });
      walletTx.status = 'PD';
      await queryRunner.manager.save(walletTx);

      // inform admin for rollback transaction
      await this.adminNotificationService.setAdminNotification(
        `Transaction in redeem.service.handleRequestRedeemEvent had been rollback, error: ${err}`,
        'rollbackTxError',
        'Transaction Rollbacked',
        true,
        payload.walletTxId
      );

    } finally {
      // finalize queryRunner
      await queryRunner.release();
    }
  }

  async payout(adminId: number, payload: PayoutDto) {
    // fetch redeemTx
    const redeemTx = await this.redeemTxRepository.findOne({
      where: { id: payload.redeemTxId },
      relations: { walletTx: true }
    });

    // check if redeemTx exists
    if (redeemTx === null) {
      return { error: `redeemTxId: ${payload.redeemTxId} not found`, data: null };
    }

    // check if this redeemTx is already payout
    if (redeemTx.isPayoutTransferred) {
      return { error: `This redeem request is already payout`, data: null };
    }

    // start queryRunner
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      
      const amountAfterFees = Number(redeemTx.amount) - Number(redeemTx.fees);
      const destinationAddress = redeemTx.receiverAddress;

      // interact with Payout Pool contract
      const chain_provider_url = redeemTx.chainId === 56
        ? process.env.BNB_PROVIDER_RPC_URL
        : process.env.OPBNB_PROVIDER_RPC_URL;
      const chain_provider = new ethers.JsonRpcProvider(chain_provider_url)
      const payoutBotSigner = new ethers.Wallet(process.env.PAYOUT_BOT_PRIVATE_KEY, chain_provider); // TEMP: fetch private key from env
      const payoutPoolContractAddress = redeemTx.chainId === 56
        ? process.env.BNB_PAYOUT_POOL_CONTRACT_ADDRESS
        : process.env.OPBNB_PAYOUT_POOL_CONTRACT_ADDRESS;
      const payoutPoolContract = Payout__factory.connect(payoutPoolContractAddress, payoutBotSigner);
      const txResponse = await payoutPoolContract.payout(
        ethers.parseEther(amountAfterFees.toString()),
        destinationAddress,
        payload.signature,
        { gasLimit: 120000 } // increased by ~30% from actual gas used
      );
      const txReceipt = await txResponse.wait();

      // update signature, txHash & fromAddress for redeemTx
      redeemTx.payoutSignature = payload.signature;
      redeemTx.payoutTxHash = txReceipt.hash;
      redeemTx.fromAddress = payoutBotSigner.address;
      await queryRunner.manager.save(redeemTx);

      if (txReceipt.status === 1) {
        // update redeemTx
        redeemTx.fromAddress = payoutBotSigner.address;
        redeemTx.isPayoutTransferred = true;
        redeemTx.payoutStatus = 'S';
        await queryRunner.manager.save(redeemTx);

        // update walletTx
        const walletTx = await this.walletTxRepository.findOneBy({ id: redeemTx.walletTx.id });
        walletTx.status = 'S';
        await queryRunner.manager.save(walletTx);

        // send notification to user for successful payout
        const notification = this.notificationRepository.create({
          type: 'info',
          title: 'Payout Successful',
          message: `Your payout request for amount ${walletTx.txAmount} has been processed successfully.`,
          walletTx: walletTx,
        });
        await queryRunner.manager.save(notification);
        const userNotification = this.userNotificationRepository.create({
          notification,
          user: await this.userRepository.findOneBy({ id: walletTx.userWalletId }),
        });
        await queryRunner.manager.save(userNotification);

      } else { // txReceipt.status === 0
        // update redeemTx
        redeemTx.isPayoutTransferred = false;
        await queryRunner.manager.save(redeemTx);

        // update walletTx
        const walletTx = redeemTx.walletTx;
        walletTx.status = 'PD';
        await queryRunner.manager.save(walletTx);

        // send notification to admin to check for failed payout
        await this.adminNotificationService.setAdminNotification(
          `Payout for redeemTxId ${payload.redeemTxId} has failed. Please check.`,
          'error',
          'Payout Failed',
          true
        );
      }

      await queryRunner.commitTransaction();

    } catch (err) {
      // rollback queryRunner
      await queryRunner.rollbackTransaction();

      // update walletTx
      const walletTx = await this.walletTxRepository.findOneBy({ id: redeemTx.walletTx.id });
      walletTx.status = 'PD';
      await this.walletTxRepository.save(walletTx);

      // inform admin for rollback transaction
      await this.adminNotificationService.setAdminNotification(
        `Transaction in redeem.service.payout had been rollback, error: ${err}`,
        'rollbackTxError',
        'Transaction Rollbacked',
        true
      );

      return { error: err, data: null };

    } finally {
      // finalize queryRunner
      await queryRunner.release();
    }

    return { error: null, data: { redeemTx: redeemTx } };
  }

  async getCurrentRedeemable(userId: number): Promise<RedeemResponse> {
    const userWallet = await this.userWalletRepository.findOneBy({ userId });
    return {
      error: null,
      data: {
        currentRedeemable: userWallet.redeemableBalance,
      }
    };
  }

  async getPendingPayout(): Promise<RedeemTx[]> {
    const pendingPayout = await this.redeemTxRepository.find({
      where: {
        payoutCanProceed: true,
        payoutSignature: IsNull(),
      },
    });
    return pendingPayout;
  }
}
