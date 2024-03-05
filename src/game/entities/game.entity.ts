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
// import { Wallet } from './wallet.entity';
import { Bet } from 'src/bet/entities/bet.entity';
import { Claim } from '../../claim/entities/claim.entity';
import { BetDto } from 'src/bet/dto/bet.dto';
import { DrawResult } from './drawResult.entity';

@Entity()
export class Game {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  epoch: number;

  @Column({ default: false })
  isCurrentEpoch: boolean;

  @Column()
  maxBetPerNumber: number;

  @Column()
  closeAt: Date;

  @Column({ default: false })
  isClosed: boolean;

  @OneToMany(() => Bet, (bet) => bet.game)
  bets: Bet[];

  @OneToMany(() => Claim, (claim) => claim.game)
  claims: Claim[];

  @OneToOne(() => DrawResult, (drawResult) => drawResult.game)
  drawResult: DrawResult;
}
