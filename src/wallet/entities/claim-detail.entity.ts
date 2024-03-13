import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WalletTx } from './wallet-tx.entity';
import { DrawResult } from 'src/game/entities/draw-result.entity';
import { BetOrder } from 'src/game/entities/bet-order.entity';

@Entity()
export class ClaimDetail {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  prize: string;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  claimAmount: number;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  bonusAmount: number;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  pointAmount: number;

  // Foreign Keys
  @Column()
  walletTxId: number;

  @ManyToOne(() => WalletTx, (walletTx) => walletTx.claimDetail)
  walletTx: WalletTx;

  @Column()
  drawResultId: number;

  @ManyToOne(() => DrawResult, (drawResult) => drawResult.claimTx)
  drawResult: DrawResult;

  @OneToOne(() => BetOrder, (bet) => bet.claimTx)
  @JoinColumn()
  betOrder: BetOrder;
}
