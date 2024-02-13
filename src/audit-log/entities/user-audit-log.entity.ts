import { User } from 'src/user/entities/user.entity';
import { Entity } from 'typeorm';
import { AuditLog } from './audit-log.entity';

@Entity()
export class UserAuditLog extends AuditLog {
  user?: User;
}
