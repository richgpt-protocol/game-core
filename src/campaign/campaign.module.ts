import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign } from './entities/campaign.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Campaign])],
  providers: [],
  controllers: [],
  exports: [],
})
export class CampaignModule {}
