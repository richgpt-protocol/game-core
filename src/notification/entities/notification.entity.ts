import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserNotification } from './user-notification.entity';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';

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

  @ManyToOne(() => WalletTx, (walletTx) => walletTx.id)
  @JoinColumn()
  walletTx: WalletTx;
}
