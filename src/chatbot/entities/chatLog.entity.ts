import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { Message } from './message.entity';
import { PointTx } from 'src/point/entities/point-tx.entity';

@Entity()
export class ChatLog {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createAt: Date;

  @Column()
  userId: number;

  @ManyToOne(() => User, (user) => user.chatLogs)
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => Message, (message) => message.chatLog)
  messages: Message[];

  @OneToOne(() => PointTx, (pointTx) => pointTx.chatLog)
  pointTx: PointTx;
}
