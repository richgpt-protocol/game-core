import { UserNotification } from 'src/notification/entities/user-notification.entity';
import { ReferralTx } from 'src/referral/entities/referral-tx.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { ChatLog } from 'src/chatbot/entities/chatLog.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    unique: true,
    nullable: true,
  })
  uid: string;

  @Column({
    nullable: true,
  })
  phoneNumber: string;

  @Column({
    nullable: true,
  })
  tgUsername: string;

  @Column({
    nullable: true,
  })
  tgId: number;

  @Column({ nullable: true })
  referralCode: string;

  @Column({
    comment:
      'A - active, I - inactive, S - Suspended, T - Terminated, U - Unverified, P - Pending',
  })
  // active - active account
  // inactive -
  // suspended - 3 times wrong otp input
  // terminated -
  // unverified - sign up but not yet verified via otp
  // pending - pending for admin/developer to review
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

  @Column({
    default: 1,
    comment: '1 - Bronze, 2 - Silver, 3 - Gold',
  })
  referralRank: number;

  @Column({
    comment: 'SMS, TELEGRAM, WHATSAPP',
    nullable: true,
  })
  otpMethod: string;

  @Column({
    nullable: true,
  })
  emailAddress: string;

  @Column({
    default: false,
  })
  isEmailVerified: boolean;

  @Column({
    nullable: true,
  })
  emailVerificationCode: string;

  @Column({
    nullable: true,
  })
  emailOtpGenerateTime: Date;

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

  @OneToMany(() => ReferralTx, (referraltx) => referraltx.user)
  referralTx: ReferralTx[];

  @OneToMany(() => ReferralTx, (referraltx) => referraltx.referralUser)
  referredTx: ReferralTx[];

  @OneToOne(() => UserWallet, (userWallet) => userWallet.user)
  @JoinColumn()
  wallet: UserWallet;

  @OneToMany(
    () => UserNotification,
    (userNotification) => userNotification.user,
  )
  userNotifications: UserNotification[];

  @OneToMany(() => ChatLog, (chatLog) => chatLog.user)
  chatLogs: ChatLog[];
}
