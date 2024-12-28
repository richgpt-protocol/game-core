import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class SquidGameRevival {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  // this revival record is for which stage
  stageNumber: number;

  @Column({ nullable: true })
  reviveTime: number;

  @Column({ default: 0 })
  amountPaid: number;

  @Column({ default: 0 })
  amountReferred: number;

  @CreateDateColumn()
  createdDate: Date;

  @UpdateDateColumn()
  updatedDate: Date;
}
