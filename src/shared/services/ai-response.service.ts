import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { MongoClient } from 'mongodb';

var similarity = require('compute-cosine-similarity'); // pure js lib, use import will cause error
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

const client = new MongoClient(process.env.MONGODB_URI); // for number recommendation based on input
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = 'gpt-4o-mini';

@Injectable()
export class AiResponseService {
  constructor(
    @InjectRepository(ChatLog)
    private chatLogRepository: Repository<ChatLog>,
  ) {}



  async generateInactiveUserNotification(userId: number, content: string): Promise<string> {
    const initialContent = content;

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

    await this.chatLogRepository.save(
      this.chatLogRepository.create({
        userId,
        role: 'system',
        content: initialContent,
      }),
    );

    await this.chatLogRepository.save(
      this.chatLogRepository.create({
        userId,
        role: 'assistant',
        content: assistantMessage,
      }),
    );

    return assistantMessage;
  }


}
