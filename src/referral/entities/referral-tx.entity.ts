import { BetOrder } from 'src/game/entities/bet-order.entity';
import { User } from 'src/user/entities/user.entity';
import { DepositTx } from 'src/wallet/entities/deposit-tx.entity';
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
    comment: 'DEPOSIT, PRIZE, BET',
  })
  referralType: string;

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

  @Column()
  depositTxId: number;

  @OneToOne(() => DepositTx, (depositTx) => depositTx.referralTx)
  @JoinColumn()
  depositTx: DepositTx;

  @Column()
  betOrderId: number;

  @OneToOne(() => BetOrder, (betOrder) => betOrder.referralTx)
  @JoinColumn()
  betOrder: BetOrder;
}
