import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from 'src/config/config.service';
import { User } from 'src/user/entities/user.entity';
import { Telegraf } from 'telegraf';
import { Repository } from 'typeorm';
import { AdminNotificationService } from './admin-notification.service';

@Injectable()
export class TelegramService {
  telegramOTPBot: Telegraf;
  telegramOTPBotUserName: string;

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

      if (user.tgId && user.tgUsername && user.status == 'A') {
        //Login OTP
        if (user.tgUsername != username) {
          return await ctx.reply('Invalid Username');
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

        if (existing && existing.status != 'U') {
          return await ctx.reply('Telegram already linked to an account');
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

    console.log(user);

    if (!user) {
      return await ctx.reply('Invalid request');
    }

    // if (user.phoneNumber != contact.phone_number) {
    //   return await ctx.reply('Invalid phone number');
    // }

    if (
      user.tgId != id ||
      user.tgUsername != username ||
      user.phoneNumber != contact.phone_number
    ) {
      user.tgUsername = null;
      user.tgId = null;
      await this.userRepository.save(user);
      return await ctx.reply('Invalid Data. Please try to register again');
    }

    await ctx.reply(
      `Please use the code - ${user.verificationCode} to verify your mobile number for ${this.configService.get(
        'APP_NAME',
      )} user registration.`,
    );
  }
}
