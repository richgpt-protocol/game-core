import { Module } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { ChatbotController } from './chatbot.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionModule } from 'src/permission/permission.module';
import { ChatLog } from './entities/chatLog.entity';
import { Message } from './entities/message.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatLog, Message]),
    PermissionModule,
  ],
  providers: [ChatbotService],
  controllers: [ChatbotController],
  exports: [],
})
export class ChatbotModule {}
