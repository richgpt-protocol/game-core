import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { WalletTx } from './wallet-tx.entity';
import { Jackpot } from 'src/game/entities/jackpot.entity';
import { JackpotTx } from 'src/game/entities/jackpot-tx.entity';

@Entity()
export class ClaimJackpotDetail {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  matchedCharCount: number;

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

  @Column()
  walletTxId: number;

  @ManyToOne(() => WalletTx, (walletTx) => walletTx.id)
  walletTx: WalletTx;

  @Column()
  jackpotId: number;

  @ManyToOne(() => Jackpot, (jackpot) => jackpot.claimJackpotDetails)
  jackpot: Jackpot;

  @Column()
  jackpotTxId: number;

  @ManyToOne(() => JackpotTx, (jackpotTx) => jackpotTx.id)
  jackpotTx: JackpotTx;
}
