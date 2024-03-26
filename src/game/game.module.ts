import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
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
import { BetService } from './bet.service';
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';
import { ConfigModule } from 'src/config/config.module';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';

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
      GameUsdTx,
      WalletTx,
    ]),
    PermissionModule,
    ConfigModule,
    ScheduleModule.forRoot(),
  ],
  providers: [GameService, BetService],
  controllers: [GameController],
  exports: [GameService],
})
export class GameModule {}
