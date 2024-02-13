import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Permission } from './permission.entity';

@Entity()
export class PermissionAccess {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    comment:
      'S - Superuser, F - Finance, M - Marketing, O - Operations, R - Recruiter (Admin)',
  })
  role: string;

  @Column({
    comment:
      'Any UserId for Superuser, Finance, Marketing, Operations, Recruiter (Admin)',
  })
  userId: number;

  @ManyToOne(() => Permission, (permission) => permission.permissionAccesses, {
    eager: true,
  })
  permission!: Permission;
}
