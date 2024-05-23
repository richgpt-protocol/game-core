import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class GeneralLog {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  userId: number;

  @Column({ nullable: true })
  username: string;

  @Column({ nullable: true })
  userRole: string;

  @Column({ nullable: true })
  reqQuery: string;

  @Column({ nullable: true })
  reqBody: string;

  @Column({ nullable: true })
  reqParams: string;

  @Column({ nullable: true })
  reqMethod: string;

  @Column({ nullable: true })
  reqUrl: string;

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ nullable: true })
  resStatusCode: number;

  @Column({ nullable: true })
  resMessage: string;

  @Column({ nullable: true })
  resData: string;
}
