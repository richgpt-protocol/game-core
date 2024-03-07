import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserWallet } from './user-wallet.entity';
import { DepositTx } from './deposit-tx.entity';
import { ClaimTx } from './claim-tx.entity';
import { BetOrder } from 'src/game/entities/bet-order.entity';
import { RedeemTx } from './redeem-tx.entity';

@Entity()
export class WalletTx {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    comment: 'DEPOSIT, PLAY, CLAIM, REDEEM',
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
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  startingBalance: number;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  endingBalance: number;

  @CreateDateColumn()
  createdDate: Date;

  @Column()
  userWalletId: number;

  @ManyToOne(() => UserWallet, (userWallet) => userWallet.walletTx)
  userWallet: UserWallet;

  @OneToOne(() => DepositTx, (depositTx) => depositTx.walletTx)
  @JoinColumn()
  depositTx: WalletTx;

  @OneToOne(() => ClaimTx, (claimTx) => claimTx.walletTx)
  @JoinColumn()
  claimTx: WalletTx;

  @OneToMany(() => BetOrder, (betOrder) => betOrder.walletTx)
  betOrders: BetOrder[];

  @OneToOne(() => RedeemTx, (redeemTx) => redeemTx.walletTx)
  @JoinColumn()
  redeemTx: RedeemTx;
}
