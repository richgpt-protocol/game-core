import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Game } from './game.entity';
import { ClaimTx } from 'src/wallet/entities/claim-tx.entity';

@Entity()
export class DrawResult {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    comment: 'First - 1, Second - 2, Third - 3, Special - S, Consolation - C',
  })
  prizeCategory: string;

  @Column()
  numberPair: string;

  @CreateDateColumn()
  createdDate: Date;

  // Foreign Keys
  @Column()
  gameId: number;

  @ManyToOne(() => Game, (game) => game.drawResult)
  game: Game;

  @OneToMany(() => ClaimTx, (claimTx) => claimTx.drawResult)
  claimTx: ClaimTx[];
}
