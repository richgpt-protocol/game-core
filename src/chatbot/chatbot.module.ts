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
import { UserModule } from 'src/user/user.module';
import { ConfigService } from 'src/config/config.service';
import { User } from 'src/user/entities/user.entity';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User, 
      ChatLog,
      Notification,
      UserNotification,
      UserWallet,
      PointTx,
      Admin,
    ]),
    PermissionModule,
    UserModule,
    CacheModule.register()
  ],
  providers: [ChatbotService, AdminNotificationService, ConfigService],
  controllers: [ChatbotController],
  exports: [],
})
export class ChatbotModule {}
