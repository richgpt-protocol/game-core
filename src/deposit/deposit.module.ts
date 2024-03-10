import { Module } from '@nestjs/common';
import { DepositService } from './deposit.service';
import { DepositController } from './deposit.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogModule } from 'src/audit-log/audit-log.module';
import { PermissionModule } from 'src/permission/permission.module';
import { SharedModule } from 'src/shared/shared.module';
import { AdminModule } from 'src/admin/admin.module';
import { SseModule } from 'src/admin/sse/sse.module';
import { DepositTx } from 'src/wallet/entities/deposit-tx.entity';
import { HttpModule } from '@nestjs/axios';
import { ConfigService } from 'src/config/config.service';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { WalletService } from 'src/wallet/wallet.service';
import { User } from 'src/user/entities/user.entity';
import { BetOrder } from 'src/game/entities/bet-order.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([DepositTx, UserWallet, User, BetOrder]),
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
