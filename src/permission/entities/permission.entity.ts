import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { PermissionAccess } from './permission-access.entity';

@Entity()
export class Permission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  code: string;

  @Column()
  description: string;

  @Column({
    comment:
      'S - Superuser, F - Finance, M - Marketing, O - Operations, R - Recruiter (Admin) - Combined in a list',
  })
  roles: string;

  @OneToMany(() => PermissionAccess, (access) => access.permission)
  permissionAccesses: PermissionAccess[];
}
