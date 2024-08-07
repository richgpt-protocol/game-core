import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/user/entities/user.entity';

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

  @Column()
  role: 'system' | 'user' | 'assistant' | 'tool' | 'function';

  @Column({ type: 'longtext', nullable: true })
  content: string;
}
