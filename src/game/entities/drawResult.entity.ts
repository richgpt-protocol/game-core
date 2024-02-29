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
import { Bet } from './bet.entity';
import { Claim } from './claim.entity';
import { BetDto } from '../dto/bet.dto';
import { Game } from './game.entity';

@Entity()
export class DrawResult {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  submitAt: Date;

  @Column()
  first: string;

  @Column()
  second: string;

  @Column()
  third: string;

  @Column()
  special1: string;

  @Column()
  special2: string;

  @Column()
  special3: string;

  @Column()
  special4: string;

  @Column()
  special5: string;

  @Column()
  special6: string;

  @Column()
  special7: string;

  @Column()
  special8: string;

  @Column()
  special9: string;

  @Column()
  special10: string;

  @Column()
  consolation1: string;

  @Column()
  consolation2: string;

  @Column()
  consolation3: string;

  @Column()
  consolation4: string;

  @Column()
  consolation5: string;

  @Column()
  consolation6: string;

  @Column()
  consolation7: string;

  @Column()
  consolation8: string;

  @Column()
  consolation9: string;

  @Column()
  consolation10: string;

  @Column()
  consolation11: string;

  @Column()
  consolation12: string;

  @Column()
  consolation13: string;

  @Column()
  consolation14: string;

  @Column()
  consolation15: string;

  @Column()
  consolation16: string;

  @Column()
  consolation17: string;

  @Column()
  consolation18: string;

  @Column()
  consolation19: string;

  @Column()
  consolation20: string;

  @OneToOne(() => Game, (game) => game.drawResult)
  @JoinColumn()
  game: Game;
}
