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

  @Column({
    comment: 'S - success, P - Pending, F - Failed',
  })
  status: string;

  @Column()
  rejectedReason: string;

  @CreateDateColumn()
  createdDate: Date;

  @UpdateDateColumn()
  updatedDate: Date;

  @Column()
  senderAddress: string;

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
    nullable: true,
  })
  txHash: string;

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

  @Column()
  reviewedBy: number;

  @ManyToOne(() => Admin, (admin) => admin.redeemTxs)
  admin: Admin;

  @OneToOne(() => WalletTx, (walletTx) => walletTx.redeemTx)
  walletTx: WalletTx;
}
