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
import { Game } from './game.entity';
import { BetDto } from '../dto/bet.dto';
import { Claim } from './claim.entity';

@Entity()
export class Bet {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  number: string;

  @Column()
  forecast: boolean;

  @Column()
  amount: number;

  @CreateDateColumn()
  submitAt: Date;

  @OneToOne(() => Claim, (claim) => claim.bet)
  claim: Claim;

  @Column()
  walletId: number;

  @ManyToOne(() => Wallet, (wallet) => wallet.bets)
  @JoinColumn({ name: 'walletId' })
  wallet: Wallet;

  @Column()
  gameId: number;

  @ManyToOne(() => Game, (game) => game.bets)
  @JoinColumn({ name: 'gameId' })
  game: Game;
}
