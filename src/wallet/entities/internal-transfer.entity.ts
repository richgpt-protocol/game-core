import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { Column, Entity, OneToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class InternalTransfer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  senderWalletTxId: number;

  @OneToOne(() => WalletTx, (walletTx) => walletTx.id)
  senderWalletTx: WalletTx;

  @Column()
  receiverWalletTxId: number;

  @OneToOne(() => WalletTx, (walletTx) => walletTx.id)
  receiverWalletTx: WalletTx;
}
