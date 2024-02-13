import { Column, CreateDateColumn, PrimaryGeneratedColumn } from 'typeorm';
import { Entity } from 'typeorm/decorator/entity/Entity';

@Entity()
export class EmailLogs {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'text',
    nullable: true,
  })
  apiRequest: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  apiResponse: string;

  @CreateDateColumn()
  createdDate: Date;
}
