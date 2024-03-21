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

@Entity()
export class WalletTx {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    comment: 'DEPOSIT, PLAY, CLAIM, REDEEM, REFERRAL',
  })
  txType: string;

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
    comment: 'S - success, P - Pending, F - Failed',
  })
  status: string;

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

  @ManyToOne(() => UserWallet, (userWallet) => userWallet.walletTx)
  userWallet: UserWallet;

  @OneToOne(() => DepositTx, (depositTx) => depositTx.walletTx)
  @JoinColumn()
  depositTx: DepositTx;

  @OneToMany(() => ClaimDetail, (claimDetail) => claimDetail.walletTx)
  @JoinColumn()
  claimDetail: ClaimDetail;

  @OneToMany(() => BetOrder, (betOrder) => betOrder.walletTx)
  betOrders: BetOrder[];

  @OneToOne(() => RedeemTx, (redeemTx) => redeemTx.walletTx)
  @JoinColumn()
  redeemTx: RedeemTx;

  // This is a new field that used to keep track of the gameusd flows for each transaction type.
  // This is required for all the transaction types.
  @OneToOne(() => GameUsdTx, (gameUsdTx) => gameUsdTx.walletTx)
  @JoinColumn()
  gameUsdTx: GameUsdTx;

  @OneToOne(() => ReferralTx, (referralTx) => referralTx.walletTx)
  referralTx: ReferralTx;
}
