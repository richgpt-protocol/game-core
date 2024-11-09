import { Campaign } from 'src/campaign/entities/campaign.entity';
import { GameTx } from 'src/public/entity/gameTx.entity';
import { PointTxType } from 'src/shared/enum/txType.enum';
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';
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

@Entity()
export class PointTx {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    comment: 'CLAIM, CAMPAIGN, DEPOSIT, BET, CHAT, REFERRAL',
  })
  txType: PointTxType.BET |
    PointTxType.CAMPAIGN |
    PointTxType.CLAIM |
    PointTxType.DEPOSIT |
    PointTxType.REFERRAL |
    PointTxType.CHAT |
    PointTxType.GAME_TRANSACTION |
    PointTxType.QUEST |
    PointTxType.ADJUSTMENT;

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
  startingBalance: number;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  endingBalance: number;

  @Column({
    nullable: true,
  })
  taskId: number;

  @CreateDateColumn()
  createdDate: Date;

  @UpdateDateColumn()
  updatedDate: Date;

  @Column()
  walletId: number;

  @ManyToOne(() => UserWallet, (userWallet) => userWallet.pointTx)
  userWallet: UserWallet;

  @Column({
    nullable: true,
  })
  walletTxId: number;

  // Used for CLAIM, DEPOSIT, REFERRAL
  @OneToOne(() => WalletTx, (walletTx) => walletTx.pointTx)
  @JoinColumn()
  walletTx: WalletTx;

  // Used for BET only
  @OneToOne(() => GameUsdTx, (gameUsdTx) => gameUsdTx.pointTx)
  @JoinColumn()
  gameUsdTx: GameUsdTx;

  // Used for CAMPAIGN
  @Column({
    nullable: true,
  })
  campaignId: number;

  @ManyToOne(() => Campaign, (campaign) => campaign.pointTx)
  campaign: Campaign;

  @Column({
    nullable: true,
  })
  isLevelUp: boolean;

  @OneToOne(() => GameTx, (gameTx) => gameTx.pointTx)
  @JoinColumn()
  gameTx: GameTx;
}
