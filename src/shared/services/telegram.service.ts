import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from 'src/config/config.service';
import { User } from 'src/user/entities/user.entity';
import { Telegraf } from 'telegraf';
import { Repository } from 'typeorm';
import { AdminNotificationService } from './admin-notification.service';
import * as TelegramBot from 'node-telegram-bot-api';
import { UserStatus } from '../enum/status.enum';
import axios from 'axios';

@Injectable()
export class TelegramService {
  telegramOTPBot: Telegraf;
  fuyoBot: TelegramBot;
  telegramOTPBotUserName: string;
  fuyoBotWebhookSecret: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private adminNotificationService: AdminNotificationService,
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
  }

  private handleStartFuyoBot(msg) {
    const senderId = msg.from?.id || 0;
    const chatId = msg.chat.id;
    const photoUrl =
      'https://storage.googleapis.com/fuyo-assets/photo_2025-01-03%2018.33.32.jpeg';

    // Define the inline keyboard
    const inlineKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎮 Play Now', web_app: { url: 'https://game.fuyo.lol/' } }],
          [{ text: '📲 Download FUYO', url: 'https://app.fuyo.lol/' }],
          [{ text: '🐦 Follow us on X', url: 'https://x.com/fuyoapp' }],
          [{ text: '💬 Join the Community', url: 'https://t.me/fuyoapp' }],
          [
            {
              text: '📖 Win a Share of 50k USDT',
              url: 'https://medium.com/@fuyoapp/fuyo-beta-mainnet-launch-the-4d-lottery-game-you-didnt-know-you-needed-until-now-50-000-usdt-60f10d4dad64',
            },
          ],
        ],
      },
    };

    this.fuyoBot.sendPhoto(chatId, photoUrl, {
      caption:
        '<b>🔥 1 BTC. 1 Winner. Will it be YOU? 🔥</b> \n\n🏆 4 Stage campaign.\n💀 Last Man Standing.\n💸 Win 1 $BTC.\n\nJoin #FuyoSquidGame 🦑\n\n<b>Fuyo is revolutionising the lottery gaming with blockchain, AI & ChatGPT!</b>\n\n🤑 Play 4D bet for 6500x win!\n🚀 Gain XP = future $FUYO airdrop\n\nGet rich. #GetFuyo.',
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
      console.log('Response:', response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        console.error('Error response:', error.response.data);
      } else {
        console.error('Error message:', (error as any).message);
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
      console.log('error', error);
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
      console.log('Invalid Data: ', user, id, username, contact.phone_number);
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
}
