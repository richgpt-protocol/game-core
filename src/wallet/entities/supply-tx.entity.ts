import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserWallet } from './user-wallet.entity';

@Entity()
export class SupplyTx {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  amount: number;

  @Column({
    comment: 'S - success, P - Pending, F - Failed',
  })
  status: string;

  @Column()
  chainId: number;

  @Column()
  currency: string;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  amountInUSD: number;

  @Column()
  txHash: string;

  @CreateDateColumn()
  createdDate: Date;

  @UpdateDateColumn()
  updatedDate: Date;

  // Foreign Keys
  @Column()
  userWalletId: number;

  @ManyToOne(() => UserWallet, (userWallet) => userWallet.supplyTx)
  userWallet: UserWallet;
}
