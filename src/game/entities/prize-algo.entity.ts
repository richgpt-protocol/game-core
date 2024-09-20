import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class PrizeAlgo {
  @PrimaryGeneratedColumn()
  id: number;

  @UpdateDateColumn()
  updatedDate: Date;

  @Column({
    comment: 'admin id',
  })
  updatedBy: number;

  @Column({
    unique: true,
  })
  key: string;

  @Column({
    nullable: true,
  })
  value: string;
}
