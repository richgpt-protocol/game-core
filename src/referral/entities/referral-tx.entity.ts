import { User } from 'src/user/entities/user.entity';
import { DepositTx } from 'src/wallet/entities/deposit-tx.entity';
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';
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

/**
 * used for record transaction of referral fee
 */

@Entity()
export class ReferralTx {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  rewardAmount: number;

  @Column({
    comment: 'DEPOSIT, PRIZE, BET, SET_REFERRAL',
  })
  referralType: string;

  @Column({ nullable: true, comment: 'only used for SET_REFERRAL' })
  txHash: string;

  @Column({
    nullable: true,
    comment:
      'S - success, P - pending, PD - Pending Developer, F - failed, only used for SET_REFERRAL',
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

  @OneToOne(() => WalletTx, (walletTx) => walletTx.referralTx)
  @JoinColumn()
  walletTx: WalletTx;

  @OneToOne(() => GameUsdTx, (gameUsdTx) => gameUsdTx.referralTx)
  @JoinColumn()
  gameUsdTx: GameUsdTx; // only used for BET
}
