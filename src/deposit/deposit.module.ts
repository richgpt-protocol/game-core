import { Module } from '@nestjs/common';
import { DepositService } from './deposit.service';
import { DepositController } from './deposit.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogModule } from 'src/audit-log/audit-log.module';
import { PermissionModule } from 'src/permission/permission.module';
import { SharedModule } from 'src/shared/shared.module';
import { AdminModule } from 'src/admin/admin.module';
import { SseModule } from 'src/admin/sse/sse.module';
import { Deposit } from './entities/deposit.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Deposit]),
    // AuditLogModule,
    // PermissionModule,
    // SharedModule,
    // AdminModule,
    // SseModule,
  ],
  providers: [DepositService],
  controllers: [DepositController],
  exports: [],
})
export class DepositModule {}
