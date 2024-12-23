import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class SquidGameRevive {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  stageNumber: number;

  @Column({ nullable: true })
  reviveTime: number;

  @Column({ nullable: true })
  amountPaid: number;

  @Column({ nullable: true })
  amountReferred: number;

  @CreateDateColumn()
  createdDate: Date;

  @UpdateDateColumn()
  updatedDate: Date;
}
