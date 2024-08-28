import { Module } from '@nestjs/common';
import { UserModule } from 'src/user/user.module';
import { PublicService } from './public.service';
import { WalletModule } from 'src/wallet/wallet.module';
import { PublicController } from './public.controller';

@Module({
  imports: [UserModule, WalletModule],
  providers: [PublicService],
  controllers: [PublicController],
  exports: [PublicService],
})
export class PublicModule {}
