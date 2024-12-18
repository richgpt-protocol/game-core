import { TelegramService } from './services/telegram.service';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Admin } from 'src/admin/entities/admin.entity';
import { Notification } from 'src/notification/entities/notification.entity';
import { ConfigModule } from 'src/config/config.module';
import { EmailLogs } from './entities/email-logs.entity';
import { SmsLogs } from './entities/sms-logs.entity';
import { CacheSettingService } from './services/cache-setting.service';
import { SMSService } from './services/sms.service';
import { HttpModule } from '@nestjs/axios';
import { TwilioModule } from 'nestjs-twilio';
import { ConfigService } from 'src/config/config.service';
import { UserNotification } from 'src/notification/entities/user-notification.entity';
import { AdminNotificationService } from './services/admin-notification.service';
import { GasService } from './services/gas.service';
import { ReloadTx } from 'src/wallet/entities/reload-tx.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { User } from 'src/user/entities/user.entity';
import { FCMService } from './services/fcm.service';
import { AiResponseService } from './services/ai-response.service';
import { ChatLog } from 'src/chatbot/entities/chatLog.entity';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    TypeOrmModule.forFeature([
      User,
      EmailLogs,
      Admin,
      Notification,
      UserNotification,
      SmsLogs,
      ReloadTx,
      UserWallet,
      ChatLog,
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
  providers: [
    GasService,
    SMSService,
    CacheSettingService,
    AdminNotificationService,
    FCMService,
    AiResponseService,
    TelegramService,
  ],
  exports: [
    SMSService,
    CacheSettingService,
    AdminNotificationService,
    FCMService,
    AiResponseService,
    TelegramService,
    GasService,
  ],
})
export class SharedModule {}
