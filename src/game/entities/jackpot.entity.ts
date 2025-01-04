import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TxStatus } from 'src/shared/enum/status.enum';
import { JackpotTx } from './jackpot-tx.entity';
import { ClaimJackpotDetail } from 'src/wallet/entities/claim-jackpot-detail.entity';

@Entity()
export class Jackpot {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  projectName: string;

  @Column()
  round: number;

  @Column()
  startTime: Date;

  @Column()
  endTime: Date;

  @Column()
  // in seconds
  duration: number;

  @Column()
  minimumBetAmount: number;

  @Column()
  feeTokenAddress: string;

  @Column()
  feeAmount: number;

  @Column({ nullable: true })
  // winning hash for current round, which is also the txHash for drawJackpotHash()
  jackpotHash: string;

  @Column({ nullable: true })
  // wallt id that call drawJackpotHash(), 0 for internal team
  drawWalletId: number;

  @Column({
    comment: 'S - success, P - pending, F - failed',
    nullable: true,
  })
  // status for setJackpotHash()
  status: TxStatus.SUCCESS | TxStatus.PENDING | TxStatus.FAILED;

  @Column({ nullable: true })
  // tx hash for setJackpotHash()
  txHash: string;

  @Column({ default: 0 })
  // retry count for setJackpotHash()
  retryCount: number;

  @CreateDateColumn()
  createdDate: Date;

  @UpdateDateColumn()
  updatedDate: Date;

  @OneToMany(() => JackpotTx, (jackpotTx) => jackpotTx.jackpot)
  jackpotTxs: JackpotTx[];

  @OneToMany(
    () => ClaimJackpotDetail,
    (claimJackpotDetail) => claimJackpotDetail.jackpot,
  )
  claimJackpotDetails: ClaimJackpotDetail[];
}
