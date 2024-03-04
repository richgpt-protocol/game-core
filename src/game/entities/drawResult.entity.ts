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
import { Claim } from 'src/claim/entities/claim.entity';
import { BetDto } from 'src/bet/dto/bet.dto';
import { Game } from './game.entity';

@Entity()
export class DrawResult {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  fetchStartAt: Date;

  @Column()
  submitBy: string;

  @Column()
  proof: string;

  @Column({ nullable: true })
  first: string;

  @Column({ nullable: true })
  second: string;

  @Column({ nullable: true })
  third: string;

  @Column({ nullable: true })
  special1: string;

  @Column({ nullable: true })
  special2: string;

  @Column({ nullable: true })
  special3: string;

  @Column({ nullable: true })
  special4: string;

  @Column({ nullable: true })
  special5: string;

  @Column({ nullable: true })
  special6: string;

  @Column({ nullable: true })
  special7: string;

  @Column({ nullable: true })
  special8: string;

  @Column({ nullable: true })
  special9: string;

  @Column({ nullable: true })
  special10: string;

  @Column({ nullable: true })
  consolation1: string;

  @Column({ nullable: true })
  consolation2: string;

  @Column({ nullable: true })
  consolation3: string;

  @Column({ nullable: true })
  consolation4: string;

  @Column({ nullable: true })
  consolation5: string;

  @Column({ nullable: true })
  consolation6: string;

  @Column({ nullable: true })
  consolation7: string;

  @Column({ nullable: true })
  consolation8: string;

  @Column({ nullable: true })
  consolation9: string;

  @Column({ nullable: true })
  consolation10: string;

  @Column({ nullable: true })
  consolation11: string;

  @Column({ nullable: true })
  consolation12: string;

  @Column({ nullable: true })
  consolation13: string;

  @Column({ nullable: true })
  consolation14: string;

  @Column({ nullable: true })
  consolation15: string;

  @Column({ nullable: true })
  consolation16: string;

  @Column({ nullable: true })
  consolation17: string;

  @Column({ nullable: true })
  consolation18: string;

  @Column({ nullable: true })
  consolation19: string;

  @Column({ nullable: true })
  consolation20: string;

  @OneToOne(() => Game, (game) => game.drawResult)
  @JoinColumn()
  game: Game;
}
