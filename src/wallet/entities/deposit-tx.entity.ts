import { Column, Entity, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { WalletTx } from './wallet-tx.entity';
import { ReferralTx } from 'src/referral/entities/referral-tx.entity';

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

  @OneToOne(() => WalletTx, (walletTx) => walletTx.depositTx)
  walletTx: WalletTx;

  @OneToOne(() => ReferralTx, (referralTx) => referralTx.depositTx)
  referralTx: ReferralTx;
}
