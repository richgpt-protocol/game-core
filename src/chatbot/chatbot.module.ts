import { Module } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { ChatbotController } from './chatbot.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { PermissionModule } from 'src/permission/permission.module';
import { ChatLog } from './entities/chatLog.entity';
import { UserNotification } from 'src/notification/entities/user-notification.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { Notification } from 'src/notification/entities/notification.entity';
import { Admin } from 'src/admin/entities/admin.entity';
// import { UserModule } from 'src/user/user.module';
import { ConfigService } from 'src/config/config.service';
import { ChatbotTelegram } from './chatbot.telegram';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatLog,
      Notification,
      UserNotification,
      UserWallet,
      PointTx,
      Admin,
    ]),
    PermissionModule,
    // UserModule,
    CacheModule.register(),
  ],
  providers: [ChatbotService, ConfigService, ChatbotTelegram],
  controllers: [ChatbotController],
  exports: [ChatbotService, ChatbotTelegram],
})
export class ChatbotModule {}
