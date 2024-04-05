import { Module } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { ChatbotController } from './chatbot.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { PermissionModule } from 'src/permission/permission.module';
import { ChatLog } from './entities/chatLog.entity';
import { Message } from './entities/message.entity';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { UserNotification } from 'src/notification/entities/user-notification.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { Notification } from 'src/notification/entities/notification.entity';
import { Admin } from 'src/admin/entities/admin.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatLog,
      Message,
      Notification,
      UserNotification,
      UserWallet,
      PointTx,
      Admin,
    ]),
    PermissionModule,
    CacheModule.register()
  ],
  providers: [ChatbotService, AdminNotificationService],
  controllers: [ChatbotController],
  exports: [],
})
export class ChatbotModule {}
