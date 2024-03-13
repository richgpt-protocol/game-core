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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserWallet,
      CreditWalletTx,
      ClaimDetail,
      DepositTx,
      RedeemTx,
      GameUsdTx,
      WalletTx,
      ReloadTx,
    ]),
  ],
  providers: [],
  controllers: [],
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
