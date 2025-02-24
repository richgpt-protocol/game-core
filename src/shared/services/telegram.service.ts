import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from 'src/config/config.service';
import { User } from 'src/user/entities/user.entity';
import { Telegraf } from 'telegraf';
import { Repository } from 'typeorm';
import { AdminNotificationService } from './admin-notification.service';
import * as TelegramBot from 'node-telegram-bot-api';
import { UserStatus } from '../enum/status.enum';
import axios from 'axios';
import { ChatbotTelegram } from 'src/chatbot/chatbot.telegram';
import { en, zh_hans } from '../language';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  telegramOTPBot: Telegraf;
  fuyoBot: TelegramBot;
  telegramOTPBotUserName: string;
  fuyoBotWebhookSecret: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private adminNotificationService: AdminNotificationService,
    private chatbotTelegram: ChatbotTelegram,
  ) {
    const telegramOTPBotToken = this.configService.get(
      'TELEGRAM_OTP_BOT_TOKEN',
    );
    this.telegramOTPBotUserName = this.configService.get(
      'TELEGRAM_OTP_BOT_USERNAME',
    );

    this.telegramOTPBot = new Telegraf(telegramOTPBotToken);
    this.telegramOTPBot.start((ctx) => this.handleStartCommand(ctx));
    this.telegramOTPBot.on('contact', (ctx) => this.handleContactSharing(ctx));
    this.telegramOTPBot.launch();

    this.fuyoBotWebhookSecret = this.configService.get(
      'FUYO_BOT_WEBHOOK_SECRET',
    );
    this.fuyoBot = new TelegramBot(this.configService.get('FUYO_BOT_TOKEN'), {
      polling: true,
    });

    this.fuyoBot.onText(/\/start/, (msg) => this.handleStartFuyoBot(msg));
    this.fuyoBot.on('callback_query', async (callbackQuery) => {
      if (callbackQuery.data === 'chat_with_ai') {
        await this.handleChatWithAIButton(callbackQuery);
      }
    });
    this.fuyoBot.on('message', async (msg) => {
      if (!msg.text) return;
      if (msg.text.startsWith('/')) return;

      await this.handleChatWithAIMessage(msg);
    });
  }

  private async handleStartFuyoBot(msg) {
    const senderId = msg.from?.id || 0;
    const chatId = msg.chat.id;

    const user = await this.userRepository.findOne({
      where: { tgId: senderId.toString() },
    });
    const senderLanguage = user
      ? // user.language default to null if unset
        user.language || msg.from?.language_code || 'en'
      : 'en';
    const photoUrl = 'https://storage.googleapis.com/fuyo-assets/IMG_2883.jpg';

    const inlineKeyboard = {
      reply_markup: {
        inline_keyboard: senderLanguage.startsWith('zh')
          ? zh_hans.inline_keyboard
          : en.inline_keyboard,
      },
    };

    this.fuyoBot.sendPhoto(chatId, photoUrl, {
      caption: senderLanguage.startsWith('zh') ? zh_hans.caption : en.caption,
      parse_mode: 'HTML',
      ...inlineKeyboard,
    });

    this.sendPostRequest(senderId);
  }

  private async sendPostRequest(senderId: number) {
    try {
      const response = await axios.post(
        this.configService.get('FUYO_BOT_WEBHOOK_URL'),
        {
          tgId: senderId,
        },
        {
          headers: {
            Authorization: `Bearer ${this.fuyoBotWebhookSecret}`,
            'Content-Type': 'application/json',
          },
        },
      );
      this.logger.log('Response:', response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        this.logger.error('Error response:', error.response.data);
      } else {
        this.logger.error('Error message:', (error as any).message);
      }
    }
  }

  private async handleStartCommand(ctx) {
    try {
      const { payload } = ctx;
      const { id, username, language_code } = ctx.update.message.from;

      if (!payload || payload == '') {
        return await ctx.reply('Invalid request: payload is missing');
      }

      const user = await this.userRepository.findOne({
        where: {
          uid: payload,
        },
        select: [
          'id',
          'verificationCode',
          'tgUsername',
          'tgId',
          'status',
          'isReset',
          'language',
        ],
      });

      if (!user) {
        return await ctx.reply('Invalid request');
      }

      if (user.tgId && user.status == 'A') {
        //Login OTP
        if (user.tgId != id) {
          return await ctx.reply('Invalid Telegram account');
        }

        const verificationCode = user.verificationCode;
        const appName = this.configService.get('APP_NAME');
        const senderLanguage = user.language || language_code || 'en';
        return await ctx.reply(
          senderLanguage.startsWith('zh')
            ? zh_hans.verifyMobileMessage(verificationCode, appName)
            : en.verifyMobileMessage(verificationCode, appName),
          {
            parse_mode: 'HTML',
          },
        );
      } else {
        //registeration otp

        const existing = await this.userRepository.findOne({
          where: [
            {
              tgId: id,
            },
            {
              tgUsername: username,
            },
          ],
        });
        const senderLanguage = existing?.language || language_code || 'en';

        if (
          existing &&
          existing.status != UserStatus.UNVERIFIED &&
          existing.status != UserStatus.PENDING
        ) {
          return await ctx.reply(
            senderLanguage.startsWith('zh')
              ? zh_hans.telegramRegisteredMessage
              : en.telegramRegisteredMessage,
            {
              parse_mode: 'HTML',
            },
          );
        }

        user.tgId = id;
        user.tgUsername = username;

        await this.userRepository.save(user);
        const requestContactKeyboard = {
          reply_markup: {
            keyboard: [
              [
                {
                  text: senderLanguage.startsWith('zh')
                    ? zh_hans.shareContactButton
                    : en.shareContactButton,
                  request_contact: true,
                },
              ],
            ],
            one_time_keyboard: true,
          },
        };
        return await ctx.reply(
          senderLanguage.startsWith('zh')
            ? zh_hans.shareContactMessage
            : en.shareContactMessage,
          requestContactKeyboard,
        );
      }
    } catch (error) {
      this.logger.error('error', error);
      this.adminNotificationService.setAdminNotification(
        `Error in telegram bot: ${error}`,
        'telegramBotError',
        'Telegram Bot Error',
        true,
      );
    }
  }

  private async handleContactSharing(ctx) {
    try {
      const { id, username } = ctx.update.message.from;
      const { contact } = ctx.update.message;

      // If user uploads contact manually
      if (!contact || !contact.phone_number || !contact.user_id) {
        return await ctx.reply('Invalid request: contact is missing');
      }
      if (contact.user_id != id) {
        return await ctx.reply('Invalid contact');
      }
      if (contact.vcard) {
        return await ctx.reply('Please use the Button to share contact');
      }

      const user = await this.userRepository.findOne({
        where: {
          tgId: id,
        },
        select: [
          'id',
          'verificationCode',
          'tgUsername',
          'tgId',
          'status',
          'isReset',
          'phoneNumber',
        ],
      });

      if (!user) {
        return await ctx.reply('Invalid request');
      }
      const senderLanguage = user.language || language_code || 'en';

      // if (user.phoneNumber != contact.phone_number) {
      //   return await ctx.reply('Invalid phone number');
      // }

      //Telegram removes the (+) sign from phone number for some countries
      const phone = user.phoneNumber.replace('+', '');
      const tgPhone = contact.phone_number.replace('+', '');
      if (
        user.tgId != id ||
        user.tgUsername != username ||
        // user.phoneNumber != contact.phone_number
        phone != tgPhone
      ) {
        this.logger.log(
          'Invalid Data: ',
          user,
          id,
          username,
          contact.phone_number,
        );
        user.tgUsername = null;
        user.tgId = null;
        await this.userRepository.save(user);
        return await ctx.reply(
          senderLanguage.startsWith('zh')
            ? zh_hans.telegramDataMismatchMessage
            : en.telegramDataMismatchMessage,
          {
            parse_mode: 'HTML',
          },
        );
      }

      const verificationCode = user.verificationCode;
      const appName = this.configService.get('APP_NAME');
      await ctx.reply(
        senderLanguage.startsWith('zh')
          ? zh_hans.verifyMobileMessage(verificationCode, appName)
          : en.verifyMobileMessage(verificationCode, appName),
        {
          parse_mode: 'HTML',
        },
      );
    } catch (error) {
      this.logger.error('handleContactSharing error', error);

      // inform admin
      await this.adminNotificationService.setAdminNotification(
        `Error in telegram.service.handleContactSharing: ${error}`,
        'telegramBotError',
        'Telegram Bot Error',
        true,
        true,
      );
    }
  }

  private async handleChatWithAIButton(
    callbackQuery: TelegramBot.CallbackQuery,
  ) {
    const tgId = callbackQuery.from.id;
    const user = await this.userRepository.findOne({
      where: { tgId: tgId.toString() },
    });
    const senderLanguage = user
      ? // user.language default to null if unset
        user.language || callbackQuery.from.language_code || 'en'
      : 'en';

    if (!user) {
      const tgUserName = callbackQuery.message.chat.first_name
        ? callbackQuery.message.chat.first_name
        : callbackQuery.message.chat.username
          ? callbackQuery.message.chat.username
          : 'Lucky Seeker';
      return await this.fuyoBot.sendMessage(
        callbackQuery.message.chat.id,
        senderLanguage.startsWith('zh')
          ? zh_hans.noAccountMessage(tgUserName)
          : en.noAccountMessage(tgUserName),
        { parse_mode: 'HTML' },
      );
    }

    return await this.fuyoBot.sendMessage(
      callbackQuery.message.chat.id,
      senderLanguage.startsWith('zh')
        ? zh_hans.initialMessage
        : en.initialMessage,
    );
  }

  private async handleChatWithAIMessage(msg) {
    const user = await this.userRepository.findOne({
      where: { tgId: msg.from.id },
    });
    if (!user) return; // not telegram registered user

    try {
      await this.chatbotTelegram.handleChatWithAIMessage({
        fuyoBot: this.fuyoBot,
        message: msg.text,
        userId: user.id,
        chatId: msg.chat.id,
      });
    } catch (error) {
      this.logger.error(
        'Error in telegram.service.handleChatWithAIMessage:',
        error,
      );
    }
  }

  public async sendOneTelegram(
    chatId: string,
    message: string,
    parse_mode: TelegramBot.ParseMode = 'Markdown',
  ) {
    try {
      await this.fuyoBot.sendMessage(chatId, message, {
        parse_mode,
      });
    } catch (error) {
      this.logger.error('Error sending message to telegram', error);
    }
  }
}
