import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service';
// import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from 'src/config/config.module';
import { ConfigService } from 'src/config/config.service';
// import { QueueOptions } from 'bullmq';

@Global()
@Module({
  imports: [
    ConfigModule,
    // BullModule.forRootAsync({
    //   imports: [ConfigModule],
    //   useFactory: async (configService: ConfigService) =>
    //     ({
    //       connection: {
    //         host: configService.get('REDIS_HOST'),
    //         port: +configService.get('REDIS_PORT'),
    //       },
    //     }) as QueueOptions,
    //   inject: [ConfigService],
    // }),
    // BullModule.forRoot({
    //   connection: {
    //     host: 'redis',
    //     port: 6380,
    //   },
    // }),
  ],
  providers: [QueueService, ConfigService],
  // exports: [QueueService, BullModule],
  exports: [QueueService],
})
export class QueueModule {}
