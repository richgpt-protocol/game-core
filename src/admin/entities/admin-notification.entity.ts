import {
  Column,
  DeleteDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Admin } from './admin.entity';
import { Notification } from '../entities/notification.entity';

@Entity()
export class AdminNotification {
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

  @DeleteDateColumn()
  deletedDate: Date;

  // Foreign Keys
  @ManyToOne(() => Admin, (admin) => admin.adminNotifications)
  admin: Admin;

  @ManyToOne(
    () => Notification,
    (notification) => notification.adminNotifications,
    {
      eager: true,
    },
  )
  notification: Notification;
}
