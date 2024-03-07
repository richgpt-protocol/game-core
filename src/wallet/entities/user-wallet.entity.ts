import { User } from 'src/user/entities/user.entity';
import {
  Column,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WalletTx } from './wallet-tx.entity';
import { SupplyTx } from './supply-tx.entity';
import { CreditWalletTx } from './credit-wallet-tx.entity';

@Entity()
export class UserWallet {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  walletBalance: number;

  @Column()
  walletAddress: string;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  redeemableBalance: number;

  @UpdateDateColumn()
  updatedDate: Date;

  // Foreign Keys
  @Column()
  userId: number;

  @OneToOne(() => User, (user) => user.wallet)
  user: User;

  @OneToMany(() => WalletTx, (walletTx) => walletTx.userWallet)
  walletTx: WalletTx[];

  @OneToMany(() => SupplyTx, (walletTx) => walletTx.userWallet)
  supplyTx: SupplyTx[];

  @OneToMany(() => CreditWalletTx, (walletTx) => walletTx.userWallet)
  creditWalletTx: CreditWalletTx[];
}
