import { Module } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { ChatbotController } from './chatbot.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
// import { chatbot } from './entities/chatbot.entity';
import { AuditLogModule } from 'src/audit-log/audit-log.module';
import { PermissionModule } from 'src/permission/permission.module';
import { SharedModule } from 'src/shared/shared.module';
import { AdminModule } from 'src/admin/admin.module';
import { SseModule } from 'src/admin/sse/sse.module';

@Module({
  imports: [
    // TypeOrmModule.forFeature([User]),
    // AuditLogModule,
    // PermissionModule,
    // SharedModule,
    // AdminModule,
    // SseModule,
  ],
  providers: [ChatbotService],
  controllers: [ChatbotController],
  exports: [],
})
export class ChatbotModule {}
