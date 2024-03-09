// import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
// import {
//   Column,
//   CreateDateColumn,
//   Entity,
//   JoinColumn,
//   ManyToOne,
//   PrimaryGeneratedColumn,
// } from 'typeorm';

// @Entity()
// export class Deposit {
//   @PrimaryGeneratedColumn()
//   id: number;

//   @Column()
//   amount: number;

//   @Column()
//   tokenAddress: string;

//   @Column()
//   chainId: number;

//   @Column()
//   txHash: string;

//   @CreateDateColumn()
//   submitAt: Date;

//   @Column()
//   walletId: number;

//   @ManyToOne(() => UserWallet, (wallet) => wallet.deposits)
//   @JoinColumn({ name: 'walletId' })
//   wallet: Wallet;
// }
