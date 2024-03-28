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

  @Column({
    comment: 'S - success, P - Pending, F - Failed',
    nullable: true,
  })
  payoutStatus: 'S' | 'P' | 'F';

  @Column({
    comment: 'address that initiate the payout tx',
    nullable: true,
  })
  fromAddress: string;

  @Column()
  receiverAddress: string;

  @Column({ default: false })
  isPayoutTransferred: boolean;

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

  @Column({ nullable: true })
  // adminId, 999 represent reviewed by system(auto payout criteria met)
  reviewedBy: number;

  @ManyToOne(() => Admin, (admin) => admin.redeemTxs)
  // human admin who reviewed this redeem-tx and set payoutCanProceed
  admin: Admin;

  @OneToOne(() => WalletTx, (walletTx) => walletTx.redeemTx)
  walletTx: WalletTx;
}
