import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { User } from './entities/user.entity';
import { AuditLogModule } from 'src/audit-log/audit-log.module';
import { PermissionModule } from 'src/permission/permission.module';
import { SharedModule } from 'src/shared/shared.module';
import { AdminModule } from 'src/admin/admin.module';
import { SseModule } from 'src/admin/sse/sse.module';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { ReferralTx } from 'src/referral/entities/referral-tx.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserWallet, ReferralTx]),
    AuditLogModule,
    PermissionModule,
    SharedModule,
    AdminModule,
    SseModule,
    CacheModule.register(),
  ],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
