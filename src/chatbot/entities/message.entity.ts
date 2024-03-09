import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ChatLog } from './chatLog.entity';

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
