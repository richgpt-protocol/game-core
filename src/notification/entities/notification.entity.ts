import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserNotification } from './user-notification.entity';

@Entity()
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    nullable: true,
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
    () => UserNotification,
    (userNotification) => userNotification.notification,
  )
  userNotifications: UserNotification[];
}
