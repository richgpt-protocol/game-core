import { Module } from '@nestjs/common';
import { BetService } from './bet.service';
import { BetController } from './bet.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogModule } from 'src/audit-log/audit-log.module';
import { PermissionModule } from 'src/permission/permission.module';
import { SharedModule } from 'src/shared/shared.module';
import { AdminModule } from 'src/admin/admin.module';
import { SseModule } from 'src/admin/sse/sse.module';
import { BetOrder } from 'src/game/entities/bet-order.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { Game } from 'src/game/entities/game.entity';
import { ConfigService } from 'src/config/config.service';
import { ConfigModule } from 'src/config/config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BetOrder, UserWallet, Game]),
    // AuditLogModule,
    PermissionModule,
    // SharedModule,
    // AdminModule,
    // SseModule,
  ],
  providers: [BetService, ConfigService],
  controllers: [BetController],
  exports: [],
})
export class BetModule {}
