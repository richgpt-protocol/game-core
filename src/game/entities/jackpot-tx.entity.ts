import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { TxStatus } from 'src/shared/enum/status.enum';
import { Jackpot } from './jackpot.entity';

@Entity()
export class JackpotTx {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  txHash: string;

  @Column({
    comment: 'S - success, P - pending, F - failed',
  })
  status: TxStatus.SUCCESS | TxStatus.PENDING | TxStatus.FAILED;

  @Column({ default: 0 })
  retryCount: number;

  @Column({ nullable: true })
  randomHash: string;

  @Column({
    default: false,
  })
  isClaimed: boolean;

  @Column({
    default: false,
  })
  availableClaim: boolean;

  @Column({ nullable: true })
  // only available if isClaimed is true,no decimals, 1 = $1
  payoutAmount: number;

  @CreateDateColumn()
  createdDate: Date;

  @UpdateDateColumn()
  updatedDate: Date;

  @Column()
  walletTxId: number;

  @OneToOne(() => WalletTx, (walletTx) => walletTx.id)
  walletTx: WalletTx;

  @Column({ nullable: true })
  jackpotId: number;

  @ManyToOne(() => Jackpot, (jackpot) => jackpot.jackpotTxs)
  jackpot: Jackpot;
}
