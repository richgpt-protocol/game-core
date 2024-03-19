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
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { PermissionService } from 'src/permission/permission.service';
import { PermissionModule } from 'src/permission/permission.module';
import { WalletService } from './wallet.service';
import { User } from 'src/user/entities/user.entity';
import { SharedModule } from 'src/shared/shared.module';

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
    ]),
    PermissionModule,
    SharedModule,
  ],
  providers: [WalletService, ClaimService, RedeemService],
  controllers: [WalletController],
  exports: [],
})
export class WalletlModule {}
// import { WalletService } from './wallet.service';
// import { WalletController } from './wallet.controller';
// import { TypeOrmModule } from '@nestjs/typeorm';
// import { AuditLogModule } from 'src/audit-log/audit-log.module';
// import { PermissionModule } from 'src/permission/permission.module';
// import { SharedModule } from 'src/shared/shared.module';
// import { AdminModule } from 'src/admin/admin.module';
// import { SseModule } from 'src/admin/sse/sse.module';
// import { User } from 'src/user/entities/user.entity';
// import { Wallet } from './entities/wallet.entity';
// import { Bet } from 'src/bet/entities/bet.entity';
// import { GameModule } from 'src/game/game.module';

// @Module({
//   imports: [
//     TypeOrmModule.forFeature([User, Wallet, Bet]),
//     // AuditLogModule,
//     PermissionModule,
//     // SharedModule,
//     // AdminModule,
//     // SseModule,
//     GameModule
//   ],
//   providers: [WalletService],
//   controllers: [WalletController],
//   exports: [],
// })
// export class WalletModule {}
