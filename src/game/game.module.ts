import { Module } from '@nestjs/common';
import { GameService } from './game.service';
import { GameController } from './game.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogModule } from 'src/audit-log/audit-log.module';
import { PermissionModule } from 'src/permission/permission.module';
import { SharedModule } from 'src/shared/shared.module';
import { AdminModule } from 'src/admin/admin.module';
import { SseModule } from 'src/admin/sse/sse.module';
import { User } from 'src/user/entities/user.entity';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { Bet } from 'src/bet/entities/bet.entity';
import { Claim } from '../claim/entities/claim.entity';
import { Game } from './entities/game.entity';
import { Redeem } from '../redeem/entities/redeem.entity';
import { DrawResult } from './entities/drawResult.entity';
import { ConfigService } from 'src/config/config.service';
import { SchedulerRegistry } from '@nestjs/schedule';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Wallet,
      Game,
      Bet,
      Claim,
      Redeem,
      DrawResult,
    ]),
    // AuditLogModule,
    PermissionModule,
    // SharedModule,
    // AdminModule,
    // SseModule,
  ],
  providers: [GameService, ConfigService, SchedulerRegistry],
  controllers: [GameController],
  exports: [GameService],
})
export class GameModule {}
