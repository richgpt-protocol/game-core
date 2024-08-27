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
import { CreditWalletTx } from './credit-wallet-tx.entity';
import { ReloadTx } from './reload-tx.entity';
import { PointTx } from 'src/point/entities/point-tx.entity';

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

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  creditBalance: number;

  @Column({
    unique: true,
  })
  walletAddress: string;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  redeemableBalance: number;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  pointBalance: number;

  @UpdateDateColumn()
  updatedDate: Date;

  // Foreign Keys
  @Column()
  userId: number;

  @OneToOne(() => User, (user) => user.wallet)
  user: User;

  @OneToMany(() => WalletTx, (walletTx) => walletTx.userWallet)
  walletTx: WalletTx[];

  @OneToMany(() => ReloadTx, (walletTx) => walletTx.userWallet)
  reloadTxs: ReloadTx[];

  @OneToMany(() => CreditWalletTx, (walletTx) => walletTx.userWallet)
  creditWalletTx: CreditWalletTx[];

  @OneToMany(() => PointTx, (pointTx) => pointTx.userWallet)
  pointTx: PointTx[];
}
