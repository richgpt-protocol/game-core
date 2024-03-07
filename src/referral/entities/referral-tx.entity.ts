import { User } from 'src/user/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class ReferralTx {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  rewardAmount: number;

  @Column({
    comment: 'DEPOSIT, PRIZE',
  })
  referralType: string;

  @Column({
    nullable: true,
  })
  bonusAmount: number;

  @Column({
    nullable: true,
  })
  bonusCurrency: string;

  @CreateDateColumn()
  createdDate: Date;

  // Foreign Keys
  @Column()
  userId: number;

  @ManyToOne(() => User, (user) => user.referralTx)
  user: User;

  @Column()
  referralUserId: number;

  @ManyToOne(() => User, (user) => user.referredTx)
  referralUser: User;
}
