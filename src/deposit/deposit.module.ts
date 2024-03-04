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
import { HttpModule } from '@nestjs/axios';
import { ConfigService } from 'src/config/config.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Deposit]),
    // AuditLogModule,
    // PermissionModule,
    // SharedModule,
    // AdminModule,
    // SseModule,
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 5000,
        maxRedirects: 5,
      }),
    }),
  ],
  providers: [DepositService, ConfigService],
  controllers: [DepositController],
  exports: [],
})
export class DepositModule {}
