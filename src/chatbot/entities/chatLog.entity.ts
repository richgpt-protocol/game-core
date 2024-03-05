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
import { User } from 'src/user/entities/user.entity';
import { Bet } from 'src/bet/entities/bet.entity';
import { Claim } from 'src/claim/entities/claim.entity';
import { Redeem } from 'src/redeem/entities/redeem.entity';
import { Deposit } from 'src/deposit/entities/deposit.entity';
import { Message } from './message.entity';

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
}
