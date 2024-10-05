import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WalletTx } from './wallet-tx.entity';
import { CreditWalletTx } from './credit-wallet-tx.entity';

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
  @OneToMany(() => WalletTx, (walletTx) => walletTx.gameUsdTx)
  walletTxs: WalletTx[];

  @ManyToOne(() => CreditWalletTx, (creditWalletTx) => creditWalletTx.gameUsdTx)
  creditWalletTx: CreditWalletTx;
}
