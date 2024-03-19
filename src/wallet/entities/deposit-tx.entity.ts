import { Column, Entity, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { WalletTx } from './wallet-tx.entity';

@Entity()
export class DepositTx {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  currency: string;

  @Column()
  senderAddress: string;

  @Column()
  receiverAddress: string;

  @Column()
  chainId: number;

  @Column()
  isTransferred: boolean;

  @Column({
    comment: 'S - success, P - Pending, F - Failed',
  })
  status: string;

  @Column()
  retryCount: number;

  @Column({
    nullable: true,
  })
  txHash: string;

  @Column()
  walletTxId: number;

  @OneToOne(() => WalletTx, (walletTx) => walletTx.depositTx)
  walletTx: WalletTx;
}
