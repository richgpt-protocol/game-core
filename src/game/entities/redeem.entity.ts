import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { Game } from './game.entity';
import { BetDto } from '../dto/bet.dto';

@Entity()
export class Redeem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  amount: number;

  @CreateDateColumn()
  redeemSubmitAt: Date;

  @Column({ nullable: true })
  payoutBy: string;

  @Column({ nullable: true })
  redeemRejectBy: string;

  @Column({ nullable: true })
  redeemRejectReason: string;

  @UpdateDateColumn()
  payoutOrRejectAt: Date;

  @Column()
  walletId: string;

  @ManyToOne(() => Wallet, (wallet) => wallet.redeems)
  @JoinColumn({ name: 'walletId' })
  wallet: Wallet;
}
