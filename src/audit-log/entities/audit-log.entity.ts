import { Column, CreateDateColumn, PrimaryGeneratedColumn } from 'typeorm';

export abstract class AuditLog {
  @PrimaryGeneratedColumn()
  id?: number;

  @Column()
  module: string;

  @Column()
  actions: string;

  @CreateDateColumn()
  createdDate?: Date;

  @Column()
  userId: string;

  @Column({
    type: 'text',
  })
  content: string;

  @Column()
  ipAddress: string;
}
