import { Admin } from 'src/admin/entities/admin.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WalletTx } from './wallet-tx.entity';

@Entity()
export class RedeemTx {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  payoutNote: string;

  @Column({ nullable: true })
  payoutCanProceed: boolean;

  @Column({ nullable: true })
  payoutCheckedAt: Date;

  @Column({ nullable: true })
  payoutSignature: string;

  @Column({ nullable: true })
  payoutTxHash: string;

  @Column()
  fromAddress: string;

  @Column()
  receiverAddress: string;

  @Column()
  isTransferred: boolean;

  @Column()
  chainId: number;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  fees: number;

  @Column()
  tokenSymbol: string;

  @Column()
  tokenAddress: string;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  amount: number;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  amountInUSD: number;

  @CreateDateColumn()
  createdDate: Date;

  @UpdateDateColumn()
  updatedDate: Date;

  @Column()
  reviewBy: number;

  @ManyToOne(() => Admin, (admin) => admin.redeemTxs)
  admin: Admin;

  @OneToOne(() => WalletTx, (walletTx) => walletTx.redeemTx)
  walletTx: WalletTx;
}
