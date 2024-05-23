import { BetOrder } from 'src/game/entities/bet-order.entity';
import { User } from 'src/user/entities/user.entity';
import { DepositTx } from 'src/wallet/entities/deposit-tx.entity';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class ReferralTx {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  rewardAmount: number;

  @Column({
    comment: 'DEPOSIT, PRIZE, BET, SET_REFERRAL',
  })
  referralType: string;

  @Column({ nullable: true, comment: 'only used for SET_REFERRAL' })
  txHash: string;

  @Column({
    nullable: true,
    comment: 'S - success, P - pending, PD - Pending Developer, F - failed, only used for SET_REFERRAL',
  })
  status: 'S' | 'P' | 'PD' | 'F';

  @Column({
    nullable: true,
  })
  bonusAmount: number;

  @Column({
    nullable: true,
  })
  bonusCurrency: string;

  @CreateDateColumn()
  createdDate: Date;

  // Foreign Keys
  @Column()
  userId: number;

  @ManyToOne(() => User, (user) => user.referralTx)
  user: User;

  @Column()
  referralUserId: number;

  @ManyToOne(() => User, (user) => user.referredTx)
  referralUser: User;

  @OneToOne(() => DepositTx, (depositTx) => depositTx.referralTx)
  @JoinColumn()
  depositTx: DepositTx;

  @OneToOne(() => BetOrder, (betOrder) => betOrder.referralTx)
  @JoinColumn()
  betOrder: BetOrder;

  @OneToOne(() => WalletTx, (walletTx) => walletTx.referralTx)
  @JoinColumn()
  walletTx: WalletTx;
}
