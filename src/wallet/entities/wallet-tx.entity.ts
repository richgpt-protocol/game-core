import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserWallet } from './user-wallet.entity';
import { DepositTx } from './deposit-tx.entity';
import { ClaimDetail } from './claim-detail.entity';
import { BetOrder } from 'src/game/entities/bet-order.entity';
import { RedeemTx } from './redeem-tx.entity';
import { GameUsdTx } from './game-usd-tx.entity';
import { ReferralTx } from 'src/referral/entities/referral-tx.entity';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { InternalTransfer } from './internal-transfer.entity';
import { GameTx } from 'src/public/entity/gameTx.entity';
import { UsdtTx } from 'src/public/entity/usdt-tx.entity';
import { TxStatus } from 'src/shared/enum/status.enum';
import { WalletTxType } from 'src/shared/enum/txType.enum';

@Entity()
export class WalletTx {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    comment:
      'DEPOSIT, PLAY, CLAIM, REDEEM, REFERRAL, INTERNAL_TRANSFER, CAMPAIGN, GAME_TRANSACTION, CLAIM_JACKPOT',
  })
  txType:
    | WalletTxType.DEPOSIT
    | WalletTxType.PLAY
    | WalletTxType.CLAIM
    | WalletTxType.REDEEM
    | WalletTxType.REFERRAL
    | WalletTxType.INTERNAL_TRANSFER
    | WalletTxType.CAMPAIGN
    | WalletTxType.GAME_TRANSACTION
    | WalletTxType.CLAIM_JACKPOT;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  txAmount: number;

  @Column({
    nullable: true,
  })
  txHash: string;

  @Column({
    comment:
      'S - Success, P - Pending, P - Pending for Admin, PD - Pending for Developer, F - Failed',
    // Pending: pending for on-chain transaction confirmation
    // Pending for Admin: pending for admin approval, valid for redeem-tx only
    // Pending for Developer: pending for developer to check
  })
  status:
    | TxStatus.SUCCESS
    | TxStatus.PENDING
    | TxStatus.PENDING_ADMIN
    | TxStatus.PENDING_DEVELOPER
    | TxStatus.FAILED;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    nullable: true,
  })
  startingBalance: number;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    nullable: true,
  })
  endingBalance: number;

  @CreateDateColumn()
  createdDate: Date;

  @UpdateDateColumn()
  updatedDate: Date;

  @Column()
  userWalletId: number;

  @Column({
    nullable: true,
  })
  note: string;

  @ManyToOne(() => UserWallet, (userWallet) => userWallet.walletTx)
  userWallet: UserWallet;

  @OneToOne(() => DepositTx, (depositTx) => depositTx.walletTx)
  @JoinColumn()
  depositTx: DepositTx;

  @OneToMany(() => ClaimDetail, (claimDetail) => claimDetail.walletTx)
  @JoinColumn()
  claimDetails: ClaimDetail[];

  @OneToMany(() => BetOrder, (betOrder) => betOrder.walletTx)
  betOrders: BetOrder[];

  @OneToOne(() => RedeemTx, (redeemTx) => redeemTx.walletTx)
  @JoinColumn()
  redeemTx: RedeemTx;

  // This is a new field that used to keep track of the gameusd flows for each transaction type.
  // This is required for all the transaction types.
  @ManyToOne(() => GameUsdTx, (gameUsdTx) => gameUsdTx.walletTxs)
  gameUsdTx: GameUsdTx;

  @OneToOne(() => ReferralTx, (referralTx) => referralTx.walletTx)
  referralTx: ReferralTx;

  @OneToOne(() => PointTx, (pointTx) => pointTx.walletTx)
  pointTx: PointTx;

  @OneToOne(
    () => InternalTransfer,
    (internalTransfer) => internalTransfer.senderWalletTxId,
  )
  @JoinColumn()
  internalTransferSender: InternalTransfer;

  @OneToOne(
    () => InternalTransfer,
    (internalTransfer) => internalTransfer.receiverWalletTxId,
  )
  @JoinColumn()
  internalTransferReceiver: InternalTransfer;

  @OneToOne(() => GameTx, (gameTx) => gameTx.walletTx)
  @JoinColumn()
  gameTx: GameTx;

  @OneToOne(() => UsdtTx, (usdtTx) => usdtTx.walletTx)
  @JoinColumn()
  usdtTx: UsdtTx;
}
