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
import { CacheModule } from '@nestjs/cache-manager';
import { GameModule } from 'src/game/game.module';
import { CampaignModule } from 'src/campaign/campaign.module';
import { ChatbotModule } from 'src/chatbot/chatbot.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GameTx, UserWallet]),
    UserModule,
    NotificationModule,
    WalletModule,
    ConfigModule,
    SharedModule,
    GameModule,
    CampaignModule,
    CacheModule.register(),
    ChatbotModule,
  ],
  providers: [PublicService],
  controllers: [PublicController],
  exports: [PublicService],
})
export class PublicModule {}
