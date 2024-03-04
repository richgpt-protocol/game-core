import { Module } from '@nestjs/common';
import { RedeemService } from './redeem.service';
import { RedeemController } from './redeem.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogModule } from 'src/audit-log/audit-log.module';
import { PermissionModule } from 'src/permission/permission.module';
import { SharedModule } from 'src/shared/shared.module';
import { AdminModule } from 'src/admin/admin.module';
import { SseModule } from 'src/admin/sse/sse.module';
import { Redeem } from './entities/redeem.entity';
import { Wallet } from 'ethers';

@Module({
  imports: [
    TypeOrmModule.forFeature([Redeem, Wallet]),
    // AuditLogModule,
    PermissionModule,
    // SharedModule,
    // AdminModule,
    // SseModule,
  ],
  providers: [RedeemService],
  controllers: [RedeemController],
  exports: [],
})
export class RedeemModule {}
