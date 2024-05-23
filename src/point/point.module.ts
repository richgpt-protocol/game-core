import { Module } from '@nestjs/common';
import { PointService } from './point.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PointTx } from './entities/point-tx.entity';
import { SharedModule } from 'src/shared/shared.module';
import { BetOrder } from 'src/game/entities/bet-order.entity';
import { ChatLog } from 'src/chatbot/entities/chatLog.entity';
import { User } from 'src/user/entities/user.entity';
import { DrawResult } from 'src/game/entities/draw-result.entity';
import { WalletModule } from 'src/wallet/wallet.module';
import { UserModule } from 'src/user/user.module';
// import { PointController } from './point.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PointTx, BetOrder, ChatLog, User, DrawResult]),
    SharedModule,
    WalletModule,
    UserModule,
  ],
  providers: [PointService],
  exports: [PointService, TypeOrmModule.forFeature([ChatLog])],
  // controllers: [PointController],
})
export class PointModule {}
