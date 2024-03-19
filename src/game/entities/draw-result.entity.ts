import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Game } from './game.entity';
import { ClaimDetail } from 'src/wallet/entities/claim-detail.entity';

@Entity()
export class DrawResult {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    comment: 'First - 1, Second - 2, Third - 3, Special - S, Consolation - C',
  })
  prizeCategory: string;

  @Column({
    comment: 'index based on number array return by smart contract.',
    // 0 is first prize, 1 is second prize, 2 is third prize, 3-13 is special prize, 14-32 is consolation prize
  })
  prizeIndex: number;

  @Column()
  numberPair: string;

  @CreateDateColumn()
  createdDate: Date;

  // Foreign Keys
  @Column()
  gameId: number;

  @ManyToOne(() => Game, (game) => game.drawResult)
  game: Game;

  @OneToMany(() => ClaimDetail, (claimDetail) => claimDetail.drawResult)
  claimDetail: ClaimDetail[];
}
