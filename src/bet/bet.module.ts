import { Module } from '@nestjs/common';
import { BetService } from './bet.service';
import { BetController } from './bet.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogModule } from 'src/audit-log/audit-log.module';
import { PermissionModule } from 'src/permission/permission.module';
import { SharedModule } from 'src/shared/shared.module';
import { AdminModule } from 'src/admin/admin.module';
import { SseModule } from 'src/admin/sse/sse.module';
import { Bet } from './entities/bet.entity';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { Game } from 'src/game/entities/game.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Bet, Wallet, Game]),
    // AuditLogModule,
    PermissionModule,
    // SharedModule,
    // AdminModule,
    // SseModule,
  ],
  providers: [BetService],
  controllers: [BetController],
  exports: [],
})
export class BetModule {}
