import { PointTx } from 'src/point/entities/point-tx.entity';
import { ClaimApproach } from 'src/shared/enum/campaign.enum';
import { CreditWalletTx } from 'src/wallet/entities/credit-wallet-tx.entity';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Campaign {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  description: string;

  @Column()
  rewardPerUser: number;

  @Column({
    nullable: true,
  })
  banner: string;

  @Column({
    comment: 'timestamp in seconds',
  })
  startTime: number;

  @Column({
    comment: 'timestamp in seconds',
  })
  endTime: number;

  @Column({
    nullable: true,
  })
  numberOfWinners: number;

  @Column({
    nullable: true,
  })
  validationParams: string;

  @Column()
  claimApproach: ClaimApproach;

  @Column()
  maxNumberOfClaims: number;

  @OneToMany(() => CreditWalletTx, (creditWalletTx) => creditWalletTx.campaign)
  creditWalletTx: CreditWalletTx[];

  @OneToMany(() => PointTx, (pointTx) => pointTx.campaign)
  pointTx: PointTx[];
}
