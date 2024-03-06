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
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { WalletService } from 'src/wallet/wallet.service';
import { User } from 'src/user/entities/user.entity';
import { Bet } from 'src/bet/entities/bet.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Deposit, Wallet, User, Bet]),
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
    PermissionModule,
  ],
  providers: [DepositService, ConfigService, WalletService],
  controllers: [DepositController],
  exports: [],
})
export class DepositModule {}
