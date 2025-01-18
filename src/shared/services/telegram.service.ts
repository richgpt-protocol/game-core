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

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  telegramOTPBot: Telegraf;
  fuyoBot: TelegramBot;
  telegramOTPBotUserName: string;
  fuyoBotWebhookSecret: string;
  isUserRegisteredInFuyoCache: boolean = false;

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
      await this.handleChatWithAIMessage(msg);
    });
  }

  private handleStartFuyoBot(msg) {
    const senderId = msg.from?.id || 0;
    const chatId = msg.chat.id;
    const photoUrl = 'https://storage.googleapis.com/fuyo-assets/IMG_2883.jpg';

    // Define the inline keyboard
    const inlineKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🤖 Fuyo AI', callback_data: 'chat_with_ai' }],
          [
            {
              text: '🎮 Fuyo TG Game',
              web_app: { url: 'https://game.fuyo.lol/' },
            },
          ],
          [{ text: '🐦 Follow us on X', url: 'https://x.com/FuyoAI' }],
          [{ text: '💬 Join the Community', url: 'https://t.me/fuyoapp' }],
          [{ text: '📲 Download Fuyo App', url: 'https://app.fuyo.lol/' }],
          [{ text: '📖 Learn More', url: 'https://docs.fuyo.lol/' }],
        ],
      },
    };

    this.fuyoBot.sendPhoto(chatId, photoUrl, {
      caption:
        '<b>Welcome to Fuyo AI - Your Personal AI Agent for GambleFi!🤖💰</b>\n\n<b>🎰Bet smarter and win bigger!</b>\n\n<b>💰Earn XP for $FUYO airdrops!</b>\n\n<b>🔥Double chance of winning - 4D lottery with up to 6500x returns and seasonal Jackpots!</b>\n\n<b>Get rich. #GetFuyoAI!🤑</b>\n\n<b>👇Tap a button to get started:</b>',
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
      const { id, username } = ctx.update.message.from;

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

        return await ctx.reply(
          `Please use the code - ${user.verificationCode} to verify your mobile number for logging into ${this.configService.get(
            'APP_NAME',
          )}`,
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

        if (
          existing &&
          existing.status != UserStatus.UNVERIFIED &&
          existing.status != UserStatus.PENDING
        ) {
          return await ctx.reply(
            'Please Contact Admin. Telegram already registered',
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
                  text: 'Share Contact',
                  request_contact: true,
                },
              ],
            ],
            one_time_keyboard: true,
          },
        };
        return await ctx.reply(
          'Please share your contact information:',
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
        'Telegram data mismatch. Is the telegram Phone number same as the registered phone number?',
      );
    }

    await ctx.reply(
      `Please use the code - ${user.verificationCode} to verify your mobile number for ${this.configService.get(
        'APP_NAME',
      )} user registration.`,
    );
  }

  private async handleChatWithAIButton(
    callbackQuery: TelegramBot.CallbackQuery,
  ) {
    const tgId = callbackQuery.from.id;

    const user = await this.userRepository.findOne({
      where: { tgId: tgId.toString() },
    });
    if (!user) {
      const tgUserName = callbackQuery.message.chat.first_name
        ? callbackQuery.message.chat.first_name
        : callbackQuery.message.chat.username
          ? callbackQuery.message.chat.username
          : 'Lucky Seeker';
      return await this.fuyoBot.sendMessage(
        callbackQuery.message.chat.id,
        `💸 WANT TO MAKE MONEY? 💸

Hi ${tgUserName}! Ready to win big with <b>Fuyo AI</b>? 🏆

<b>Chat with our AI</b> to predict your lucky 4D number. 🔥

🔥 Start making real money today! 👉 https://t.me/fuyo_game_bot/fuyo_game
`,
        { parse_mode: 'HTML' },
      );
    }

    this.isUserRegisteredInFuyoCache = true;
    return await this.fuyoBot.sendMessage(
      callbackQuery.message.chat.id,
      `Hey! 👋 I’m your FUYO AI buddy. Got questions about 4D draws, results, or just wanna chat about lucky numbers? Let’s talk—I’m here for you! 🍀`,
    );
  }

  private async handleChatWithAIMessage(msg) {
    const user = await this.userRepository.findOne({
      where: { tgId: msg.from.id },
    });

    if (!this.isUserRegisteredInFuyoCache) {
      return;
      /*
        comment above return and uncomment below code will let user to chat directly
        without need to click 'Chat with Professor Fuyo' button
        if user is already registered in Fuyo app
      */
      //   if (!user) return;
      //   this.isUserRegisteredInFuyoCache = true;
    }

    // temporary solution
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
}
