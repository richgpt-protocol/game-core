import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Admin } from './entities/admin.entity';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AuditLogModule } from 'src/audit-log/audit-log.module';
import { PermissionModule } from 'src/permission/permission.module';
import { SseModule } from './sse/sse.module';
import { UserNotification } from 'src/notification/entities/user-notification.entity';
import { ConfigModule } from 'src/config/config.module';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { Notification } from 'src/notification/entities/notification.entity';
import { User } from 'src/user/entities/user.entity';
import { UserService } from 'src/user/user.service';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Admin, User, Notification, UserNotification]), 
    forwardRef(() => AuditLogModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
    SseModule,
    ConfigModule, 
  ],
  providers: [AdminService, AdminNotificationService],
  exports: [AdminService,AdminNotificationService],

  controllers: [AdminController],
})
export class AdminModule {}
