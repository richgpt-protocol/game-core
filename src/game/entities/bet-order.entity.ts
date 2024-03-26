import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Game } from './game.entity';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { CreditWalletTx } from 'src/wallet/entities/credit-wallet-tx.entity';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { ClaimDetail } from 'src/wallet/entities/claim-detail.entity';
import { ReferralTx } from 'src/referral/entities/referral-tx.entity';

@Entity()
export class BetOrder {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  numberPair: string;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  bigForecastAmount: number;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  smallForecastAmount: number;

  @Column({
    default: false,
  })
  isClaimed: boolean;

  @Column({
    default: false,
  })
  availableClaim: boolean;

  @CreateDateColumn()
  createdDate: Date;

  @UpdateDateColumn()
  updatedDate: Date;

  @Column({ default: false })
  isMasked: boolean;

  // Foreign Keys

  @Column()
  gameId: number;

  @ManyToOne(() => Game, (game) => game.betOrders)
  game: Game;

  @Column()
  walletTxId: number;

  @ManyToOne(() => WalletTx, (walletTx) => walletTx.betOrders)
  walletTx: WalletTx;

  @Column({
    nullable: true,
  })
  creditWalletTxId: number;

  @OneToOne(() => CreditWalletTx, (creditWalletTx) => creditWalletTx.betOrder)
  creditWalletTx: CreditWalletTx;

  @OneToOne(() => PointTx, (pointTx) => pointTx.betOrder)
  pointTx: PointTx;

  @OneToOne(() => ClaimDetail, (claimDetail) => claimDetail.betOrder)
  claimDetail: ClaimDetail;

  @OneToOne(() => ReferralTx, (referralTx) => referralTx.betOrder)
  referralTx: ReferralTx;
}
