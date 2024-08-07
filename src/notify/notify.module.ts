import { Module } from '@nestjs/common';
import { NotifyService } from './notify.service';
import { ConfigService } from 'src/config/config.service';
import { ConfigModule } from 'src/config/config.module';
// import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    // TypeOrmModule.forFeature([]),
    ConfigModule,
  ],
  providers: [NotifyService, ConfigService],
  exports: [NotifyService],
})
export class NotifyModule {}
