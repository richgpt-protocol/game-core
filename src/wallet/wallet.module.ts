import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogModule } from 'src/audit-log/audit-log.module';
import { PermissionModule } from 'src/permission/permission.module';
import { SharedModule } from 'src/shared/shared.module';
import { AdminModule } from 'src/admin/admin.module';
import { SseModule } from 'src/admin/sse/sse.module';
import { User } from 'src/user/entities/user.entity';
import { Wallet } from './entities/wallet.entity';
import { Bet } from 'src/game/entities/bet.entity';
import { GameModule } from 'src/game/game.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Wallet, Bet]),
    // AuditLogModule,
    PermissionModule,
    // SharedModule,
    // AdminModule,
    // SseModule,
    GameModule
  ],
  providers: [WalletService],
  controllers: [WalletController],
  exports: [],
})
export class WalletModule {}
