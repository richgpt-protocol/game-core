import { Admin } from 'src/admin/entities/admin.entity';
import { Entity } from 'typeorm';
import { AuditLog } from './audit-log.entity';

@Entity()
export class AdminAuditLog extends AuditLog {
  admin?: Admin;
}
