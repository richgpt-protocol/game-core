import { forwardRef, MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserWallet } from './entities/user-wallet.entity';
import { CreditWalletTx } from './entities/credit-wallet-tx.entity';
import { DepositTx } from './entities/deposit-tx.entity';
import { RedeemTx } from './entities/redeem-tx.entity';
import { ReloadTx } from './entities/reload-tx.entity';
import { WalletTx } from './entities/wallet-tx.entity';
import { GameUsdTx } from './entities/game-usd-tx.entity';
import { ClaimDetail } from './entities/claim-detail.entity';
import { WalletController } from './wallet.controller';
import { ClaimService } from './services/claim.service';
import { WithdrawService } from './services/withdraw.service';
import { BetOrder } from 'src/game/entities/bet-order.entity';
import { Game } from 'src/game/entities/game.entity';
import { DrawResult } from 'src/game/entities/draw-result.entity';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { Notification } from 'src/notification/entities/notification.entity';
import { UserNotification } from 'src/notification/entities/user-notification.entity';
import { Admin } from 'src/admin/entities/admin.entity';
import { Setting } from 'src/setting/entities/setting.entity';
import { PermissionModule } from 'src/permission/permission.module';
import { WalletService } from './wallet.service';
import { User } from 'src/user/entities/user.entity';
import { SharedModule } from 'src/shared/shared.module';
import { ReferralTx } from 'src/referral/entities/referral-tx.entity';
import { UserModule } from 'src/user/user.module';
import { InternalTransferService } from './services/internal-transfer.service';
import { InternalTransfer } from './entities/internal-transfer.entity';
import { ConfigService } from 'src/config/config.service';
import { DepositService } from './services/deposit.service';
import { PointModule } from 'src/point/point.module';
import { ConfigModule } from 'src/config/config.module';
import { CreditService } from './services/credit.service';
import { IpWhitelistMiddleware } from './middleware/ip-whitelist.middleware';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserWallet,
      CreditWalletTx,
      ClaimDetail,
      DepositTx,
      RedeemTx,
      GameUsdTx,
      WalletTx,
      ReloadTx,
      BetOrder,
      Game,
      DrawResult,
      PointTx,
      Notification,
      UserNotification,
      Admin,
      Setting,
      ReferralTx,
      InternalTransfer,
    ]),
    PermissionModule,
    SharedModule,
    UserModule,
    forwardRef(() => PointModule),
    ConfigModule,
  ],
  providers: [
    WalletService,
    ClaimService,
    WithdrawService,
    InternalTransferService,
    ConfigService,
    DepositService,
    CreditService,
  ],
  controllers: [WalletController],
  exports: [WalletService, CreditService],
})
export class WalletModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(IpWhitelistMiddleware)
    .forRoutes({ path: 'api/v1/wallet/deposit', method: RequestMethod.POST });
  }
}
