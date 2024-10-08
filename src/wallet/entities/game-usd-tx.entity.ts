import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WalletTx } from './wallet-tx.entity';
import { CreditWalletTx } from './credit-wallet-tx.entity';
import { BetOrder } from 'src/game/entities/bet-order.entity';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { ReferralTx } from 'src/referral/entities/referral-tx.entity';

@Entity()
export class GameUsdTx {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  amount: number;

  @Column()
  chainId: number;

  @Column({
    comment: 'S - success, P - pending, F - failed',
  })
  status: string;

  @Column({
    nullable: true,
  })
  txHash: string;

  @Column()
  senderAddress: string;

  @Column()
  receiverAddress: string;

  @Column({
    default: 0,
  })
  retryCount: number;

  @Column({
    nullable: true,
  })
  walletTxId: number;

  // OneToMany is used for internal transfer
  @OneToMany(() => WalletTx, (walletTx) => walletTx.gameUsdTx)
  walletTxs: WalletTx[];

  @ManyToOne(() => CreditWalletTx, (creditWalletTx) => creditWalletTx.gameUsdTx)
  creditWalletTx: CreditWalletTx;

  @OneToMany(() => BetOrder, (betOrder) => betOrder.gameUsdTx)
  betOrders: BetOrder[];

  @OneToOne(() => PointTx, (pointTx) => pointTx.gameUsdTx)
  pointTx: PointTx;

  @OneToOne(() => ReferralTx, (referralTx) => referralTx.gameUsdTx)
  referralTx: ReferralTx;
}
