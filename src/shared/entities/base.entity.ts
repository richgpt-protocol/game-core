import { Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export class BaseEntity {
  @Column({
    select: false,
  })
  createdBy: string;

  @CreateDateColumn({
    select: false,
  })
  createdDate: Date;

  @Column({
    nullable: true,
    select: false,
  })
  updatedBy: string;

  @UpdateDateColumn({
    select: false,
  })
  updatedDate: Date;
}

export class BaseEntityWithSelectTrue {
  @Column()
  createdBy?: string;

  @CreateDateColumn()
  createdDate?: Date;

  @Column({
    nullable: true,
  })
  updatedBy?: string;

  @UpdateDateColumn()
  updatedDate?: Date;
}

export class BaseEntityWithTimestamp {
  @Column()
  createdBy: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdDate: Date;

  @Column({
    nullable: true,
  })
  updatedBy: string;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedDate: Date;
}
