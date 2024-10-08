import { User } from 'src/user/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class PointSnapshot {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'decimal',
    precision: 30,
    scale: 18,
    default: 0,
  })
  xp: number;

  @Column({
    type: 'timestamp',
  })
  snapshotDate: Date;

  @CreateDateColumn()
  createdDate: Date;

  @UpdateDateColumn()
  updatedDate: Date;

  @Column()
  walletId: number;

  @ManyToOne(() => User)
  user: User;
}
