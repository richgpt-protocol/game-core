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
import { User } from 'src/user/entities/user.entity';
import { Bet } from 'src/bet/entities/bet.entity';
import { Claim } from 'src/claim/entities/claim.entity';
import { Redeem } from 'src/redeem/entities/redeem.entity';
import { Deposit } from 'src/deposit/entities/deposit.entity';
import { Credit } from './credit.entity';

@Entity()
export class Wallet {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  walletAddress: string;

  // temporarily, will replaced by mpc
  @Column()
  privateKey: string;

  @Column({ default: 0 })
  balance: number;

  @Column({ default: 0 })
  redeemable: number;

  @Column({ default: 0 })
  xp: number;

  @OneToOne(() => User, (user) => user.id)
  @JoinColumn()
  user: User;

  @OneToMany(() => Deposit, (deposit) => deposit.wallet)
  deposits: Deposit[];

  @OneToMany(() => Bet, (bet) => bet.wallet)
  bets: Bet[];

  @OneToMany(() => Claim, (claim) => claim.wallet)
  claims: Claim[];

  @OneToMany(() => Redeem, (redeem) => redeem.wallet)
  redeems: Redeem[];

  @OneToMany(() => Credit, (credit) => credit.wallet)
  credits: Credit[];
}
