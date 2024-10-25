import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Game } from './game.entity';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { CreditWalletTx } from 'src/wallet/entities/credit-wallet-tx.entity';
import { ClaimDetail } from 'src/wallet/entities/claim-detail.entity';
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';

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

  @Column({
    default: false,
  })
  isClaimed: boolean;

  @Column({
    default: false,
  })
  availableClaim: boolean;

  @CreateDateColumn()
  createdDate: Date;

  @UpdateDateColumn()
  updatedDate: Date;

  @Column({ default: false })
  isMasked: boolean;

  @Column({
    comment: 'S - Straight, P - permutation',
  })
  type: string;

  @Column({
    nullable: true,
  })
  motherPair: string;

  // Foreign Keys

  @Column()
  gameId: number;

  @ManyToOne(() => Game, (game) => game.betOrders)
  game: Game;

  @Column({
    nullable: true,
  })
  walletTxId: number;

  @ManyToOne(() => WalletTx, (walletTx) => walletTx.betOrders)
  walletTx: WalletTx;

  @OneToOne(() => CreditWalletTx, (creditWalletTx) => creditWalletTx.betOrder)
  @JoinColumn()
  creditWalletTx: CreditWalletTx;

  @OneToOne(() => ClaimDetail, (claimDetail) => claimDetail.betOrder)
  claimDetail: ClaimDetail;

  @ManyToOne(() => GameUsdTx, (gameUsdTx) => gameUsdTx.betOrders)
  gameUsdTx: GameUsdTx;
}
