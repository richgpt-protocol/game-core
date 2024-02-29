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
import { Bet } from './bet.entity';

@Entity()
export class Claim {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  number: string;

  @Column()
  forecast: boolean;

  @Column()
  claimAmount: number;

  @Column()
  drawResultIndex: number;

  @Column()
  prize: string;

  @CreateDateColumn()
  submitAt: Date;

  @OneToOne(() => Bet, (bet) => bet.claim)
  @JoinColumn()
  bet: Bet;

  @ManyToOne(() => Wallet, (wallet) => wallet.claims)
  wallet: Wallet;

  @ManyToOne(() => Game, (game) => game.claims)
  game: Game;
}
