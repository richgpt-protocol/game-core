import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { MongoClient } from 'mongodb';

var similarity = require('compute-cosine-similarity');
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { UserService } from 'src/user/user.service';
import { ChatCompletionMessageParam } from 'openai/resources';
import { PointTxType } from 'src/shared/enum/txType.enum';
import axios from 'axios';
import { ConfigService } from 'src/config/config.service';
import * as dotenv from 'dotenv';
import { ChatLog } from 'src/chatbot/entities/chatLog.entity';

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = 'gpt-4o-mini';

@Injectable()
export class AiResponseService {
  private cachedAiMessage: string | null = null;
  constructor(
    @InjectRepository(ChatLog)
    private chatLogRepository: Repository<ChatLog>,
  ) {}

  private contentGenerateInactiveUserNotification(): string {
    return `Help me create a short, clear, polite, and funny message with emojis to encourage inactive users to return and join a bet.`;
  }

  async generateInactiveUserNotification(): Promise<string> {
    const initialContent = this.contentGenerateInactiveUserNotification();

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: initialContent },
      {
        role: 'assistant',
        content: `Hello! It's been a while since we've seen you here. Let's get back to the excitement! 🚀`,
      },
    ];

    const completion = await openai.chat.completions.create({
      model: model,
      messages,
    });

    const assistantMessage = completion.choices[0].message.content;

    return assistantMessage;
  }

  async saveAiMessageToChatLog(userId: number, message: string): Promise<void> {
    await this.chatLogRepository.save(
      this.chatLogRepository.create({
        userId,
        role: 'assistant',
        content: message,
      }),
    );
  }
}
