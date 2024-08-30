import { Campaign } from 'src/campaign/entities/campaign.entity';
import { ChatLog } from 'src/chatbot/entities/chatLog.entity';
import { GameTx } from 'src/public/entity/gameTx.entity';
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
  txType: string;

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

  // Used for CLAIM, DEPOSIT, BET, REFERRAL
  @OneToOne(() => WalletTx, (walletTx) => walletTx.pointTx)
  @JoinColumn()
  walletTx: WalletTx;

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
