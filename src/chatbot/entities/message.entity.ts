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
import { ChatLog } from './chatLog.entity';
import { ChatCompletionRole } from 'openai/resources';

@Entity()
export class Message {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createAt: Date;

  @Column()
  role: 'system' | 'user' | 'assistant' | 'tool' | 'function';

  @Column({ type: 'longtext', nullable: true })
  content: string;

  @Column()
  chatLogId: number;

  @ManyToOne(() => ChatLog, (chatLog) => chatLog.messages)
  @JoinColumn({ name: 'chatLogId' })
  chatLog: ChatLog;
}
