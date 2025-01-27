import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from 'src/config/config.service';
import { User } from 'src/user/entities/user.entity';
import { Telegraf } from 'telegraf';
import { Repository } from 'typeorm';
import { AdminNotificationService } from './admin-notification.service';
import { UserStatus } from '../enum/status.enum';
import * as TelegramBot from 'node-telegram-bot-api';
@Injectable()
export class TelegramService {
  telegramOTPBot: Telegraf;
  telegramOTPBotUserName: string;
  private fuyoBot: TelegramBot;
  private readonly logger = new Logger(TelegramService.name);
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

    this.fuyoBot = new TelegramBot(this.configService.get('FUYO_BOT_TOKEN'), {
      polling: false,
    });

    this.telegramOTPBot = new Telegraf(telegramOTPBotToken);
    this.telegramOTPBot.start((ctx) => this.handleStartCommand(ctx));
    this.telegramOTPBot.on('contact', (ctx) => this.handleContactSharing(ctx));
    this.telegramOTPBot.launch();
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
