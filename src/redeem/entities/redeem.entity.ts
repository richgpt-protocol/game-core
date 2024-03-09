// import {
//   Column,
//   CreateDateColumn,
//   Entity,
//   JoinColumn,
//   ManyToOne,
//   PrimaryGeneratedColumn,
// } from 'typeorm';
// import { Wallet } from 'src/wallet/entities/wallet.entity';

// @Entity()
// export class Redeem {
//   @PrimaryGeneratedColumn()
//   id: number;

//   @Column()
//   amount: number;

//   @Column()
//   destinationAddress: string;

//   @CreateDateColumn()
//   redeemSubmitAt: Date;

//   @Column()
//   redeemTxHash: string;

//   @Column({ nullable: true })
//   payoutCanProceed: true;

//   @Column({ nullable: true })
//   payoutNote: string;

//   @Column({ nullable: true })
//   payoutCheckedBy: string;

//   @Column({ nullable: true })
//   payoutCheckedAt: Date;

//   @Column({ nullable: true })
//   payoutSignature: string;

//   @Column({ nullable: true })
//   payoutTxHash: string;

//   @Column({ nullable: true })
//   payoutAt: Date;

//   @Column()
//   walletId: string;

//   @ManyToOne(() => Wallet, (wallet) => wallet.redeems)
//   @JoinColumn({ name: 'walletId' })
//   wallet: Wallet;
// }
