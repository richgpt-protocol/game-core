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
import { BetDto } from '../dto/bet.dto';
import { Claim } from 'src/claim/entities/claim.entity';

@Entity()
export class Bet {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  number: string;

  @Column()
  forecast: boolean;

  @Column()
  amount: number;

  @Column()
  credit: number;

  @CreateDateColumn()
  submitAt: Date;

  @Column({ nullable: true })
  txHash: string;

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

  @OneToOne(() => Claim, (claim) => claim.bet)
  claim: Claim;
}
