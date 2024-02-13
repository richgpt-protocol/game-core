import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AdminNotification } from './admin-notification.entity';

@Entity()
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    nullable: true,
    comment:
      'CB - Cancelled Booking, PU - Pending User, PD - Pending Driver, UTR - User Topup, DCR - Driver Cashout, UCR - User Cashout',
  })
  type: string;

  @Column()
  title: string;

  @Column({
    type: 'text',
  })
  message: string;

  @CreateDateColumn()
  createdDate: Date;

  // Foreign Keys
  @OneToMany(
    () => AdminNotification,
    (adminNotification) => adminNotification.notification,
  )
  adminNotifications: AdminNotification[];
}
