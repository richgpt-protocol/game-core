import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { UserNotification } from './entities/user-notification.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, UserNotification])],
  providers: [],
  controllers: [],
})
export class NotificationModule {}
