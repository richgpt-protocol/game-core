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
import { UserWallet } from './user-wallet.entity';
import { BetOrder } from 'src/game/entities/bet-order.entity';
import { Campaign } from 'src/campaign/entities/campaign.entity';
import { GameUsdTx } from './game-usd-tx.entity';
import { GameTx } from 'src/public/entity/gameTx.entity';
import { CreditWalletTxType } from 'src/shared/enum/txType.enum';
import { TxStatus } from 'src/shared/enum/status.enum';

@Entity()
export class CreditWalletTx {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    comment: 'CREDIT, PLAY',
  })
  txType:
    | CreditWalletTxType.CREDIT
    | CreditWalletTxType.PLAY
    | CreditWalletTxType.CAMPAIGN
    | CreditWalletTxType.GAME_TRANSACTION
    | CreditWalletTxType.EXPIRY;

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
  status: TxStatus.SUCCESS | TxStatus.PENDING | TxStatus.FAILED | 'E';

  @Column({
    nullable: true,
  })
  expirationDate: Date;

  @Column({
    nullable: true,
  })
  note: string;

  @CreateDateColumn()
  createdDate: Date;

  @UpdateDateColumn()
  updatedDate: Date;

  @Column()
  walletId: number;

  @ManyToOne(() => UserWallet, (userWallet) => userWallet.creditWalletTx)
  userWallet: UserWallet;

  @OneToOne(() => BetOrder, (betOrder) => betOrder.creditWalletTx)
  betOrder: BetOrder;

  @ManyToOne(() => Campaign, (campaign) => campaign.creditWalletTx)
  campaign: Campaign;

  @ManyToOne(() => GameUsdTx, (gameUsdTx) => gameUsdTx.creditWalletTx)
  // @JoinColumn()
  gameUsdTx: GameUsdTx;

  @JoinColumn()
  @OneToOne(() => GameTx, (gameTx) => gameTx.creditWalletTx)
  gameTx: GameTx;
}
