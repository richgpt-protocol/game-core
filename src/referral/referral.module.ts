import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferralTx } from './entities/referral-tx.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ReferralTx])],
  providers: [],
  controllers: [],
  exports: [],
})
export class ReferralModule {}
