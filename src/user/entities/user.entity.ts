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

import { Wallet } from '../../wallet/entities/wallet.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  @OneToOne(() => Wallet, (wallet) => wallet.user)
  id: number;

  @Column()
  phoneNumber: string;

  @Column({ nullable: true })
  emailAddress: string;

  @Column({
    select: false,
  })
  password: string;

  @Column()
  referralCode: string;

  @Column({
    comment:
      'A - active, I - inactive, S - Suspended, T - Terminated, U - Unverified, P - Pending, R - Reject',
  })
  status: string;

  @Column({
    select: false,
  })
  isReset: boolean;

  @Column({
    nullable: true,
    select: false,
  })
  verificationCode?: string;

  @Column({
    select: false,
    default: 0,
  })
  loginAttempt: number;

  @Column({
    default: false,
  })
  isMobileVerified: boolean;

  @Column({
    nullable: true,
  })
  otpGenerateTime: Date;

  @CreateDateColumn()
  createdDate: Date;

  @UpdateDateColumn()
  updatedDate: Date;

  @Column({
    nullable: true,
  })
  updatedBy: string;

  // Foreign Keys
  @Column({
    nullable: true,
  })
  referralUserId: number;

  @ManyToOne(() => User, (user) => user.id)
  @JoinColumn({ name: 'referralUserId' })
  referralUser: User;
}
