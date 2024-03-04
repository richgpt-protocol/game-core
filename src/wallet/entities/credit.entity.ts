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
import { Wallet } from './wallet.entity';

@Entity()
export class Credit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  amount: number;

  @Column()
  expiryDate: Date;

  @Column()
  walletId: number;

  @ManyToOne(() => Wallet, (wallet) => wallet.credits)
  @JoinColumn({ name: 'walletId' })
  wallet: Wallet;
}
