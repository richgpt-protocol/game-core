import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Game } from './entities/game.entity';
import { BetOrder } from './entities/bet-order.entity';
import { DrawResult } from './entities/draw-result.entity';
import { GameService } from './game.service';
import { GameController } from './game.controller';
import { PermissionModule } from 'src/permission/permission.module';
import { User } from 'src/user/entities/user.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { RedeemTx } from 'src/wallet/entities/redeem-tx.entity';
import { ClaimDetail } from 'src/wallet/entities/claim-detail.entity';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { Notification } from 'src/notification/entities/notification.entity';
import { UserNotification } from 'src/notification/entities/user-notification.entity';
import { Admin } from 'src/admin/entities/admin.entity';
import { GameGateway } from './game.gateway';
import { CacheSettingService } from 'src/shared/services/cache-setting.service';
import { BetService } from './bet.service';
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';
import { ConfigModule } from 'src/config/config.module';
import { PointModule } from 'src/point/point.module';
import { ReferralTx } from 'src/referral/entities/referral-tx.entity';
import { SharedModule } from 'src/shared/shared.module';
import { UserModule } from 'src/user/user.module';
import { ReloadTx } from 'src/wallet/entities/reload-tx.entity';
import { CreditWalletTx } from 'src/wallet/entities/credit-wallet-tx.entity';
import { WalletModule } from 'src/wallet/wallet.module';
import { Setting } from 'src/setting/entities/setting.entity';
import { JackpotTx } from './entities/jackpot-tx.entity';
import { Jackpot } from './entities/jackpot.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      BetOrder,
      UserWallet,
      Game,
      ClaimDetail,
      RedeemTx,
      DrawResult,
      WalletTx,
      Notification,
      UserNotification,
      Admin,
      GameUsdTx,
      ReferralTx,
      ReloadTx,
      CreditWalletTx,
      Setting,
      JackpotTx,
      Jackpot,
    ]),
    PermissionModule,
    ConfigModule,
    PointModule,
    SharedModule,
    UserModule,
    WalletModule,
  ],
  providers: [
    GameService,
    AdminNotificationService,
    GameGateway,
    CacheSettingService,
    BetService,
    // CreditService,
  ],
  controllers: [GameController],
  exports: [GameService, BetService],
})
export class GameModule {}
