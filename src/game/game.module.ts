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
    ]),
    PermissionModule,
  ],
  providers: [GameService],
  controllers: [GameController],
  exports: [GameService],
})
export class GameModule {}