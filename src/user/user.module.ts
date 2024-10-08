import { forwardRef, Module } from '@nestjs/common';
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
import { WalletService } from 'src/wallet/wallet.service';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { UserNotification } from 'src/notification/entities/user-notification.entity';
import { Notification } from 'src/notification/entities/notification.entity';
import { ConfigModule } from 'src/config/config.module';
import { ConfigService } from 'src/config/config.service';
import { WalletModule } from 'src/wallet/wallet.module';
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserWallet,
      ReferralTx,
      WalletTx,
      Notification,
      UserNotification,
      GameUsdTx,
    ]),
    AuditLogModule,
    ConfigModule,
    PermissionModule,
    SharedModule,
    AdminModule,
    SseModule,
    ConfigModule,
    forwardRef(() => WalletModule),
    CacheModule.register(),
  ],
  providers: [UserService, WalletService, ConfigService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
