import {
  Column,
  CreateDateColumn,
  Entity,
  IsNull,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { Game } from 'src/game/entities/game.entity';
import { Claim } from 'src/claim/entities/claim.entity';

@Entity()
export class Deposit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  amount: number;

  @Column()
  tokenAddress: string;

  @Column()
  chainId: number;

  @Column()
  txHash: string;

  @CreateDateColumn()
  submitAt: Date;

  @Column()
  walletId: number;

  @ManyToOne(() => Wallet, (wallet) => wallet.deposits)
  @JoinColumn({ name: 'walletId' })
  wallet: Wallet;
}
