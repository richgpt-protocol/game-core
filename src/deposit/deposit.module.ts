import { Module } from '@nestjs/common';
import { DepositService } from './deposit.service';
import { DepositController } from './deposit.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigService } from 'src/config/config.service';
import { WalletService } from 'src/wallet/wallet.service';
import { User } from 'src/user/entities/user.entity';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { DepositTx } from 'src/wallet/entities/deposit-tx.entity';
import { ReloadTx } from 'src/wallet/entities/reload-tx.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';
import { BetOrder } from 'src/game/entities/bet-order.entity';
import { AdminService } from 'src/admin/admin.service';
import { AdminModule } from 'src/admin/admin.module';
import { ConfigModule } from 'src/config/config.module';
import { Admin } from 'src/admin/entities/admin.entity';
import { PermissionController } from 'src/permission/permission.controller';
import { PermissionService } from 'src/permission/permission.service';
import { Permission } from 'src/permission/entities/permission.entity';
import { PermissionAccess } from 'src/permission/entities/permission-access.entity';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { UserNotification } from 'src/notification/entities/user-notification.entity';
import { Notification } from 'src/notification/entities/notification.entity';
import { SharedModule } from 'src/shared/shared.module';
import { ReferralTx } from 'src/referral/entities/referral-tx.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DepositTx,
      UserWallet,
      User,
      WalletTx,
      ReloadTx,
      GameUsdTx,
      BetOrder,
      Notification,
      UserNotification,
      Admin,
      ReferralTx,
    ]),
    // HttpModule,
    // AuditLogModule,
    // PermissionModule,
    // SharedModule,
    AdminModule,
    ConfigModule,
    SharedModule,
    // SseModule,
  ],
  providers: [
    DepositService,
    WalletService,
    AdminNotificationService /* HttpService */,
  ],
  controllers: [DepositController],
  exports: [],
})
export class DepositModule {}
