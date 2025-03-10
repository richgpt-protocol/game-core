import { Column, Entity, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { WalletTx } from './wallet-tx.entity';
import { ReferralTx } from 'src/referral/entities/referral-tx.entity';
import { TxStatus } from 'src/shared/enum/status.enum';

/**
 * DepositTx is used for record transaction of token received to escrow wallet
 */

@Entity()
export class DepositTx {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    comment: 'token address deposited',
  })
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
  status:
    | TxStatus.SUCCESS
    | TxStatus.PENDING
    | TxStatus.PENDING_ADMIN
    | TxStatus.FAILED;

  @Column({
    default: 0,
  })
  retryCount: number;

  @Column({
    nullable: true,
  })
  txHash: string;

  @Column()
  walletTxId: number;

  @OneToOne(() => WalletTx, (walletTx) => walletTx.depositTx)
  walletTx: WalletTx;

  @OneToOne(() => ReferralTx, (referralTx) => referralTx.depositTx)
  referralTx: ReferralTx;
}
