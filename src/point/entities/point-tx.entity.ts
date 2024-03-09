import { Campaign } from 'src/campaign/entities/campaign.entity';
import { BetOrder } from 'src/game/entities/bet-order.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
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
    comment: 'PAYOUT, CAMPAIGN',
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

  @OneToOne(() => BetOrder, (betOrder) => betOrder.pointTx)
  @JoinColumn()
  betOrder: BetOrder;

  @Column()
  campaignId: number;

  @ManyToOne(() => Campaign, (campaign) => campaign.pointTx)
  campaign: Campaign;
}
