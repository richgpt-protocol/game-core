import { Column, Entity, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { WalletTx } from './wallet-tx.entity';

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

  @Column()
  retryCount: number;

  @Column()
  walletTxId: number;

  @OneToOne(() => WalletTx, (walletTx) => walletTx.gameUsdTx)
  walletTx: WalletTx;
}
