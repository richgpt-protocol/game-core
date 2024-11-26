import {
  Column,
  DeleteDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Admin } from '../../admin/entities/admin.entity';
import { Notification } from './notification.entity';
import { User } from 'src/user/entities/user.entity';

@Entity()
export class UserNotification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    default: false,
  })
  isRead: boolean;

  @Column({
    nullable: true,
  })
  readDateTime: Date;

  @Column({
    nullable: true,
  })
  channel: string;

  @Column({
    nullable: true,
  })
  status: string;

  @Column({
    nullable: true,
  })
  messageId: string;

  @Column({
    nullable: true,
  })
  remarks: string;

  @DeleteDateColumn()
  deletedDate: Date;

  // Foreign Keys
  @ManyToOne(() => Admin, (admin) => admin.userNotifications)
  admin: Admin;

  @ManyToOne(() => User, (user) => user.userNotifications)
  user: User;

  @ManyToOne(
    () => Notification,
    (notification) => notification.userNotifications,
    {
      eager: true,
    },
  )
  notification: Notification;
}
