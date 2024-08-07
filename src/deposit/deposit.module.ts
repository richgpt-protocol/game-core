import { Module } from '@nestjs/common';
import { DepositService } from './deposit.service';
import { DepositController } from './deposit.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletService } from 'src/wallet/wallet.service';
import { User } from 'src/user/entities/user.entity';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { DepositTx } from 'src/wallet/entities/deposit-tx.entity';
import { ReloadTx } from 'src/wallet/entities/reload-tx.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';
import { BetOrder } from 'src/game/entities/bet-order.entity';
import { AdminModule } from 'src/admin/admin.module';
import { ConfigModule } from 'src/config/config.module';
import { Admin } from 'src/admin/entities/admin.entity';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { UserNotification } from 'src/notification/entities/user-notification.entity';
import { Notification } from 'src/notification/entities/notification.entity';
import { SharedModule } from 'src/shared/shared.module';
import { ReferralTx } from 'src/referral/entities/referral-tx.entity';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { PointModule } from 'src/point/point.module';
import { UserModule } from 'src/user/user.module';
import { NotifyModule } from 'src/notify/notify.module';
import { NotifyService } from 'src/notify/notify.service';

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
      PointTx,
    ]),
    AdminModule,
    ConfigModule,
    SharedModule,
    PointModule,
    SharedModule,
    UserModule,
    NotifyModule,
  ],
  providers: [
    DepositService,
    WalletService,
    AdminNotificationService /* HttpService */,
    NotifyService,
  ],
  controllers: [DepositController],
  exports: [],
})
export class DepositModule {}
