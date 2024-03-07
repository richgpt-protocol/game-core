import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserNotification } from '../../notification/entities/user-notification.entity';
import { RedeemTx } from 'src/wallet/entities/redeem-tx.entity';

@Entity()
export class Admin {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    unique: true,
  })
  username: string;

  @Column()
  name: string;

  @Column()
  emailAddress: string;

  @Column({
    select: false,
  })
  password: string;

  @Column({
    comment: 'S - Superuser, Finance - F, O - Operations',
  })
  adminType: string;

  @Column({
    nullable: true,
  })
  lastLogin: Date;

  @Column()
  createdBy: string;

  @Column()
  status: string;

  @Column({
    default: 0,
    select: false,
  })
  loginAttempt: number;

  @CreateDateColumn()
  createdDate: Date;

  @UpdateDateColumn()
  updatedDate: Date;

  @Column({
    nullable: true,
  })
  updatedBy: string;

  // Foreign Keys
  @OneToMany(
    () => UserNotification,
    (userNotification) => userNotification.admin,
  )
  userNotifications: UserNotification[];

  @OneToMany(() => RedeemTx, (redeemTx) => redeemTx.admin)
  redeemTxs: RedeemTx[];
}
