import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserWallet } from './user-wallet.entity';
import { BetOrder } from 'src/game/entities/bet-order.entity';
import { Campaign } from 'src/campaign/entities/campaign.entity';
import { GameUsdTx } from './game-usd-tx.entity';

@Entity()
export class CreditWalletTx {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    comment: 'CREDIT, PLAY',
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

  @Column({
    comment: 'S - success, P - Pending, F - Failed',
  })
  status: string;

  @Column({
    nullable: true,
  })
  expirationDate: Date;

  @CreateDateColumn()
  createdDate: Date;

  @UpdateDateColumn()
  updatedDate: Date;

  @Column()
  walletId: number;

  @ManyToOne(() => UserWallet, (userWallet) => userWallet.creditWalletTx)
  userWallet: UserWallet;

  @OneToOne(() => BetOrder, (betOrder) => betOrder.creditWalletTx)
  @JoinColumn()
  betOrder: BetOrder;

  @ManyToOne(() => Campaign, (campaign) => campaign.creditWalletTx)
  campaign: Campaign;

  @OneToMany(() => GameUsdTx, (gameUsdTx) => gameUsdTx.creditWalletTx)
  gameUsdTx: GameUsdTx[];
}
