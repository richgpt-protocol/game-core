import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign } from './entities/campaign.entity';
import { CampaignController } from './campaign.controller';
import { CampaignService } from './campaign.service';
import { PermissionModule } from 'src/permission/permission.module';
import { WalletModule } from 'src/wallet/wallet.module';
import { SquidGameParticipant } from './entities/squidGame.participant.entity';
import { SquidGameRevival } from './entities/squidGame.revival.entity';
import { Setting } from 'src/setting/entities/setting.entity';
import { JackpotTx } from 'src/game/entities/jackpot-tx.entity';
import { ConfigModule } from 'src/config/config.module';
import { SharedModule } from 'src/shared/shared.module';
import { CampaignCron } from './campaign.cron';
import { User } from 'src/user/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Campaign,
      SquidGameParticipant,
      SquidGameRevival,
      Setting,
      JackpotTx,
      User,
    ]),
    PermissionModule,
    WalletModule,
    ConfigModule,
    SharedModule,
  ],
  providers: [CampaignService, CampaignCron],
  controllers: [CampaignController],
  exports: [CampaignService],
})
export class CampaignModule {}
