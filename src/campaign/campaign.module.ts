import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign } from './entities/campaign.entity';
import { CampaignController } from './campaign.controller';
import { CampaignService } from './campaign.service';
import { PermissionModule } from 'src/permission/permission.module';
import { WalletModule } from 'src/wallet/wallet.module';
import { SquidGameParticipant } from './entities/squidGame.participant.entity';
import { SquidGameRevive } from './entities/squidGame.revive.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, SquidGameParticipant, SquidGameRevive]),
    PermissionModule,
    WalletModule,
  ],
  providers: [CampaignService],
  controllers: [CampaignController],
  exports: [CampaignService],
})
export class CampaignModule {}
