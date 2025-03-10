import { Module } from '@nestjs/common';
import { BackOfficeController } from './back-office.controller';
import { BackOfficeService } from './back-office.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/user/entities/user.entity';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { ConfigModule } from 'src/config/config.module';
import { PermissionModule } from 'src/permission/permission.module';
import { SharedModule } from 'src/shared/shared.module';
import { AdminModule } from 'src/admin/admin.module';
import { Admin } from 'src/admin/entities/admin.entity';
import { DepositTx } from 'src/wallet/entities/deposit-tx.entity';
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';
import { BetOrder } from 'src/game/entities/bet-order.entity';
import { Game } from 'src/game/entities/game.entity';
import { DrawResult } from 'src/game/entities/draw-result.entity';
import { PrizeAlgo } from 'src/game/entities/prize-algo.entity';
import { CampaignService } from 'src/campaign/campaign.service';
import { Campaign } from 'src/campaign/entities/campaign.entity';
import { CampaignModule } from 'src/campaign/campaign.module';
import { WalletService } from 'src/wallet/wallet.service';
import { CreditWalletTx } from 'src/wallet/entities/credit-wallet-tx.entity';
import { ReloadTx } from 'src/wallet/entities/reload-tx.entity';
import { WalletModule } from 'src/wallet/wallet.module';
import { PointModule } from 'src/point/point.module';
import { ClaimDetail } from 'src/wallet/entities/claim-detail.entity';
import { ReferralTx } from 'src/referral/entities/referral-tx.entity';
import { Notification } from 'src/notification/entities/notification.entity';
import { UserNotification } from 'src/notification/entities/user-notification.entity';
import { UserModule } from 'src/user/user.module';
import { JackpotTx } from 'src/game/entities/jackpot-tx.entity';
import { SquidGameParticipant } from 'src/campaign/entities/squidGame.participant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserWallet,
      Admin,
      WalletTx,
      DepositTx,
      GameUsdTx,
      BetOrder,
      Game,
      DrawResult,
      PrizeAlgo,
      Campaign,
      CreditWalletTx,
      ReloadTx,
      ClaimDetail,
      ReferralTx,
      Notification,
      UserNotification,
      JackpotTx,
      SquidGameParticipant,
    ]),
    CampaignModule,
    ConfigModule,
    PermissionModule,
    SharedModule,
    AdminModule,
    WalletModule,
    PointModule,
    UserModule,
  ],
  controllers: [BackOfficeController],
  providers: [BackOfficeService, WalletService],
  exports: [BackOfficeService],
})
export class BackOfficeModule {}
