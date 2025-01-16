import { Logger, Injectable } from '@nestjs/common';
import { ConfigService } from 'src/config/config.service';
import { ChatbotService } from './chatbot.service';
import { ChatWithAIMessage } from './chatbot.types';
import { waitingResponses } from './chatbot.constant';

@Injectable()
export class ChatbotTelegram {
  private readonly logger = new Logger(ChatbotTelegram.name);

  constructor(
    private readonly configService: ConfigService,
    private chatbotService: ChatbotService,
  ) {}

  async handleChatWithAIMessage(payload: ChatWithAIMessage) {
    const { fuyoBot, message, userId, chatId } = payload;

    const waitingResponse = waitingResponses[Math.floor(Math.random() * 10)];
    await fuyoBot.sendMessage(chatId, waitingResponse);

    const replies = await this.chatbotService.sendMessage(userId, {
      message: message,
      source: 'telegram',
    });
    for (const reply of replies) {
      if (reply.type === 'image') {
        // Convert base64 to Buffer
        const imageBuffer = Buffer.from(reply.content, 'base64');
        await fuyoBot.sendPhoto(
          chatId,
          imageBuffer,
          {},
          { filename: 'image.png', contentType: 'image/png' },
        );
      } else {
        await fuyoBot.sendMessage(chatId, reply.content);
      }
    }
  }
}
