import { PointTx } from 'src/point/entities/point-tx.entity';
import { CreditWalletTx } from 'src/wallet/entities/credit-wallet-tx.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UsdtTx } from './usdt-tx.entity';
import { TxStatus } from 'src/shared/enum/status.enum';

@Entity()
export class GameTx {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  usdtAmount: number;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  creditAmount: number;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  xp: number;

  @Column()
  gameSessionToken: string;

  @Column({
    comment: 'S - Success, P - Pending, PD - Pending for Developer, F - Failed',
  })
  status: TxStatus.SUCCESS |
    TxStatus.PENDING |
    TxStatus.PENDING_DEVELOPER |
    TxStatus.FAILED;

  @Column({
    default: 0,
  })
  retryCount: number;

  @CreateDateColumn()
  createdDate: Date;

  @UpdateDateColumn()
  updatedDate: Date;

  @Column()
  userWalletId: number;

  @Column({
    default: false,
  })
  isNotified: boolean;

  @ManyToOne(() => UserWallet, (userWallet) => userWallet.gameTx)
  userWallet: UserWallet;

  @OneToOne(() => WalletTx, (walletTx) => walletTx.gameTx)
  @JoinColumn()
  walletTx: WalletTx;

  @OneToOne(() => CreditWalletTx, (creditWalletTx) => creditWalletTx.gameTx)
  @JoinColumn()
  creditWalletTx: CreditWalletTx;

  @OneToOne(() => PointTx, (pointTx) => pointTx.gameTx)
  @JoinColumn()
  pointTx: PointTx;

  @OneToOne(() => UsdtTx, (usdtTx) => usdtTx.gameTx)
  @JoinColumn()
  usdtTx: UsdtTx;
}
