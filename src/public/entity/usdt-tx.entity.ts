import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { Column, Entity, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { GameTx } from './gameTx.entity';
import { TxStatus } from 'src/shared/enum/status.enum';
import { UsdtTxType } from 'src/shared/enum/txType.enum';

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
  status: TxStatus.SUCCESS |
    TxStatus.PENDING |
    TxStatus.PENDING_DEVELOPER |
    TxStatus.FAILED;

  @Column({
    nullable: true,
  })
  txHash: string;

  @Column()
  txType: UsdtTxType.GAME_TRANSACTION | UsdtTxType.CAMPAIGN;

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
