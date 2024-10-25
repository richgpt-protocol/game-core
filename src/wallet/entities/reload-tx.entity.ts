import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserWallet } from './user-wallet.entity';
import { TxStatus } from 'src/shared/enum/status.enum';

// This entity is used for storing the supply of native tokens
// for gas fees tx for all the wallets
@Entity()
export class ReloadTx {
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
  status: TxStatus.SUCCESS | TxStatus.PENDING | TxStatus.FAILED;

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

  @Column({
    nullable: true,
  })
  txHash: string;

  @Column()
  retryCount: number;

  @CreateDateColumn()
  createdDate: Date;

  @UpdateDateColumn()
  updatedDate: Date;

  // Foreign Keys
  @Column()
  userWalletId: number;

  @ManyToOne(() => UserWallet, (userWallet) => userWallet.reloadTxs)
  userWallet: UserWallet;
}
