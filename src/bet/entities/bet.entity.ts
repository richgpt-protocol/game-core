// import {
//   Column,
//   CreateDateColumn,
//   Entity,
//   ManyToOne,
//   OneToOne,
//   PrimaryGeneratedColumn,
//   UpdateDateColumn,
// } from 'typeorm';
// import { Game } from 'src/game/entities/game.entity';
// import { CreditWalletTx } from 'src/wallet/entities/credit-wallet-tx.entity';
// import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
// import { ClaimTx } from 'src/wallet/entities/claim-tx.entity';

// @Entity()
// export class Bet {
//   @PrimaryGeneratedColumn()
//   id: number;

//   @Column()
//   numberPair: string;

//   @Column({
//     type: 'decimal',
//     precision: 30,
//     scale: 18,
//     default: 0,
//   })
//   bigForecastAmount: number;

//   @Column({
//     type: 'decimal',
//     precision: 30,
//     scale: 18,
//     default: 0,
//   })
//   smallForecastAmount: number;

//   @Column()
//   isClaimed: boolean;

//   @Column({
//     nullable: true,
//   })
//   txHash: string;

//   @CreateDateColumn()
//   createdDate: Date;

//   @UpdateDateColumn()
//   updatedDate: Date;

//   @Column()
//   gameId: number;

//   @ManyToOne(() => Game, (game) => game.betOrders)
//   game: Game;

//   @Column()
//   walletTxId: number;

//   @ManyToOne(() => WalletTx, (walletTx) => walletTx.betOrders)
//   walletTx: WalletTx;

//   @Column()
//   creaditWalletTxId: number;

//   @OneToOne(() => CreditWalletTx, (creditWalletTx) => creditWalletTx.betOrder)
//   creditWalletTx: CreditWalletTx;

//   @OneToOne(() => ClaimTx, (claimTx) => claimTx.bet)
//   claimTx: ClaimTx;
// }
