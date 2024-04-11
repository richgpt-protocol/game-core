import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InternalTransfer } from './entities/internal-transfer.entity';

@Module({
  imports: [TypeOrmModule.forFeature([InternalTransfer])],
  providers: [],
  controllers: [],
  exports: [],
})
export class InternalTransferModule {}
