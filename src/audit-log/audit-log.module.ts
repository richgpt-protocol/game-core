import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from 'src/config/config.module';
import { AdminAuditLog } from './entities/admin-audit-log.entity';
import { AuditLogService } from './audit-log.service';
import { UserAuditLog } from './entities/user-audit-log.entity';
import { AuditLogController } from './audit-log.controller';
import { PermissionModule } from 'src/permission/permission.module';
import { AdminModule } from 'src/admin/admin.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminAuditLog, UserAuditLog]),
    ConfigModule,
    PermissionModule,
    AdminModule,
  ],
  providers: [AuditLogService],
  exports: [AuditLogService],
  controllers: [AuditLogController],
})
export class AuditLogModule {}
