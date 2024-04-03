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
    ]),
    ConfigModule,
    PermissionModule,
    SharedModule,
    AdminModule,
  ],
  controllers: [BackOfficeController],
  providers: [BackOfficeService],
  exports: [BackOfficeService],
})
export class BackOfficeModule {}
