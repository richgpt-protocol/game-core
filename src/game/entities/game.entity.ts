import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { BetOrder } from './bet-order.entity';
import { DrawResult } from './draw-result.entity';

@Entity()
export class Game {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  epoch: string;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  maxBetAmount: number;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  minBetAmount: number;

  @Column({
    nullable: true,
  })
  drawTxHash: string;

  @Column()
  startDate: Date;

  @Column()
  endDate: Date;

  @Column({ default: false })
  isClosed: boolean;

  // Foreign Keys
  @OneToMany(() => BetOrder, (betOrder) => betOrder.game)
  betOrders: BetOrder[];

  @OneToMany(() => DrawResult, (drawResult) => drawResult.game)
  drawResult: DrawResult[];
}
