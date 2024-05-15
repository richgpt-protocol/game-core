import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InternalTransfer } from './entities/internal-transfer.entity';
import { InternalTransferService } from './internal-transfer.service';
import { InternalTransferController } from './internal-transfer.controller';
import { ConfigModule } from 'src/config/config.module';
import { ConfigService } from 'src/config/config.service';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { PermissionModule } from 'src/permission/permission.module';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { User } from 'src/user/entities/user.entity';
import { WalletlModule } from 'src/wallet/wallet.module';
import { WalletService } from 'src/wallet/wallet.service';
import { UserModule } from 'src/user/user.module';
import { AdminModule } from 'src/admin/admin.module';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { Notification } from 'src/notification/entities/notification.entity';
import { UserNotification } from 'src/notification/entities/user-notification.entity';
import { Admin } from 'src/admin/entities/admin.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InternalTransfer,
      UserWallet,
      GameUsdTx,
      WalletTx,
      PointTx,
      Notification,
      UserNotification,
      Admin,
      User,
    ]),
    PermissionModule,
    ConfigModule,
    UserModule,
    // WalletlModule,
  ],
  providers: [InternalTransferService, WalletService, AdminNotificationService],
  controllers: [InternalTransferController],
  exports: [],
})
export class InternalTransferModule {}
