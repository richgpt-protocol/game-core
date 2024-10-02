import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { Column, Entity, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { GameTx } from './gameTx.entity';

@Entity()
export class UsdtTx {
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
  @OneToOne(() => WalletTx, (walletTx) => walletTx.usdtTx)
  walletTx: WalletTx;

  @OneToOne(() => GameTx, (gameTx) => gameTx.usdtTx)
  gameTx: GameTx;
}
