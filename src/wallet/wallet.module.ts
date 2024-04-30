import { Module } from '@nestjs/common';
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
import { RedeemService } from './services/redeem.service';
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
import { UserService } from 'src/user/user.service';
import { ReferralTx } from 'src/referral/entities/referral-tx.entity';

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
    ]),
    PermissionModule,
    SharedModule,
  ],
  providers: [WalletService, ClaimService, RedeemService, UserService],
  controllers: [WalletController],
  exports: [],
})
export class WalletlModule {}
