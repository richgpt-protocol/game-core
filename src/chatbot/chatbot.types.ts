import * as TelegramBot from 'node-telegram-bot-api';

export type ChatWithAIMessage = {
  fuyoBot: TelegramBot;
  message: string;
  userId: number;
  chatId: number;
};
