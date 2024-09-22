import { Module } from '@nestjs/common';
import { UserModule } from 'src/user/user.module';
import { PublicService } from './public.service';
import { WalletModule } from 'src/wallet/wallet.module';
import { PublicController } from './public.controller';
import { ConfigModule } from 'src/config/config.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameTx } from './entity/gameTx.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { NotificationModule } from 'src/notification/notification.module';
import { SharedModule } from 'src/shared/shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GameTx, UserWallet]),
    UserModule,
    NotificationModule,
    WalletModule,
    ConfigModule,
    SharedModule,
  ],
  providers: [PublicService],
  controllers: [PublicController],
  exports: [PublicService],
})
export class PublicModule {}
