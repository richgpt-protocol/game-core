import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Game } from './game.entity';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { CreditWalletTx } from 'src/wallet/entities/credit-wallet-tx.entity';

@Entity()
export class BetOrder {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  numberPair: string;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  bigForecastAmount: number;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  smallForecastAmount: number;

  @Column()
  isClaimed: boolean;

  @Column()
  txHash: string;

  @CreateDateColumn()
  createdDate: Date;

  @UpdateDateColumn()
  updatedDate: Date;

  // Foreign Keys

  @Column()
  gameId: number;

  @ManyToOne(() => Game, (game) => game.betOrders)
  game: Game;

  @Column()
  walletTxId: number;

  @ManyToOne(() => WalletTx, (walletTx) => walletTx.betOrders)
  walletTx: WalletTx;

  @Column()
  creaditWalletTxId: number;

  @OneToOne(() => CreditWalletTx, (creditWalletTx) => creditWalletTx.betOrder)
  creditWalletTx: CreditWalletTx;
}
