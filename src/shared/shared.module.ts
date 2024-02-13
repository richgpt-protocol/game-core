import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminNotification } from 'src/admin/entities/admin-notification.entity';
import { Admin } from 'src/admin/entities/admin.entity';
import { Notification } from 'src/admin/entities/notification.entity';
import { ConfigModule } from 'src/config/config.module';
import { EmailLogs } from './entities/email-logs.entity';
import { SmsLogs } from './entities/sms-logs.entity';
import { CacheSettingService } from './services/cache-setting.service';
import { SMSService } from './services/sms.service';
import { HttpModule } from '@nestjs/axios';
import { TwilioModule } from 'nestjs-twilio';
import { ConfigService } from 'src/config/config.service';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    TypeOrmModule.forFeature([
      EmailLogs,
      Admin,
      Notification,
      AdminNotification,
      SmsLogs,
    ]),
    TwilioModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        accountSid: configService.get('TWILIO_ACCOUNT_SID'),
        authToken: configService.get('TWILIO_AUTH_TOKEN'),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [SMSService, CacheSettingService],
  exports: [SMSService, CacheSettingService],
})
export class SharedModule {}
