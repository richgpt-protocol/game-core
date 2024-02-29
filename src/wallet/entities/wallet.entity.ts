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
import { Bet } from 'src/game/entities/bet.entity';
import { Claim } from 'src/game/entities/claim.entity';
import { Redeem } from 'src/game/entities/redeem.entity';

@Entity()
export class Wallet {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    default: null,
    // unique: true,
  })
  walletAddress: string;

  @Column({ default: 0 })
  balance: number;

  @Column({ default: 0 })
  redeemable: number;

  // @OneToOne(() => User, (user) => user.wallet)
  // @JoinColumn()
  // user: User;

  @OneToOne(() => User, (user) => user.id)
  @JoinColumn()
  user: User;

  @OneToMany(() => Bet, (bet) => bet.wallet)
  bets: Bet[];

  @OneToMany(() => Claim, (claim) => claim.wallet)
  claims: Claim[];

  @OneToMany(() => Redeem, (redeem) => redeem.wallet)
  redeems: Redeem[];
}
