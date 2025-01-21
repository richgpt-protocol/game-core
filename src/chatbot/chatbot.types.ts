import * as TelegramBot from 'node-telegram-bot-api';

export type ChatWithAIMessage = {
  fuyoBot: TelegramBot;
  message: string;
  userId: number;
  chatId: number;
};

export type Replies = {
  type: 'text' | 'image' | 'speech' | 'bet';
  content: string;
};
