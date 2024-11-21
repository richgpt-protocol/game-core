import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Admin } from 'src/admin/entities/admin.entity';
import { Notification } from 'src/notification/entities/notification.entity';
import { UserNotification } from 'src/notification/entities/user-notification.entity';
import { Connection, In, Repository } from 'typeorm';
import * as TelegramBot from 'node-telegram-bot-api';
import { ConfigService } from 'src/config/config.service';
import { WebClient } from '@slack/web-api';
import { User } from 'src/user/entities/user.entity';
import {
  NotificationType,
  UserMessageDto,
} from '../dto/admin-notification.dto';

@Injectable()
export class AdminNotificationService {
  private readonly logger = new Logger(AdminNotificationService.name);

  private bot: TelegramBot;
  private userNotificationBot: TelegramBot;
  // private tg_admins: Array<string>;
  private TG_ADMIN_GROUP;
  private slackToken: string;
  private slackChannel: string;
  private slackClient: WebClient;
  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(UserNotification)
    private userNotificationRepository: Repository<UserNotification>,
    @InjectRepository(Admin)
    private adminRepository: Repository<Admin>,
    private configService: ConfigService,
    private connection: Connection,
  ) {
    this.TG_ADMIN_GROUP = this.configService.get('ADMIN_TG_CHAT_ID');

    // this.tg_admins = this.configService.get('ADMIN_TG_USERNAMES').split(',');
    this.userNotificationBot = new TelegramBot(
      this.configService.get('TG_USER_NOTIFICATION_BOT_TOKEN'),
      {
        polling: false,
      },
    );
    this.bot = new TelegramBot(
      this.configService.get('TG_ADMIN_NOTIFIER_BOT_TOKEN'),
      {
        polling: false,
      },
    );

    this.slackToken = this.configService.get('SLACK_TOKEN');
    this.slackChannel = this.configService.get('SLACK_CHANNEL_ID');

    if (this.slackToken) {
      this.slackClient = new WebClient(this.slackToken);
    }
  }

  async setAdminNotification(
    message: string,
    type: string,
    title: string,
    isBroadcast: boolean,
    notifyOtherChannels?: boolean,
    walletTxId?: number,
    adminId?: number,
  ) {
    const queryRunner = this.connection.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let result;
      const notification = await this.notificationRepository.save(
        this.notificationRepository.create({
          type,
          title,
          message,
          walletTx: walletTxId ? { id: walletTxId } : null,
        }),
      );

      if (notifyOtherChannels) {
        await this.notifyTelegram([this.TG_ADMIN_GROUP], message);
        await this.notifySlack(message);
      }

      if (isBroadcast) {
        // For broadcast to all admin
        const admins = await this.adminRepository.find();
        const createQueries = [];
        admins.forEach((a) => {
          createQueries.push(
            this.userNotificationRepository.create({
              isRead: false,
              admin: a,
              notification,
            }),
          );
        });

        result = await this.userNotificationRepository.save(createQueries);
      } else {
        const admin = await this.adminRepository.findOneBy({
          id: adminId,
        });
        if (admin) {
          result = await this.userNotificationRepository.save(
            this.userNotificationRepository.create({
              isRead: false,
              admin,
              notification,
            }),
          );
        }
      }

      // TODO Send Email and Notification

      await queryRunner.commitTransaction();
      return result;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      console.log('setAdminNotification', err);

      throw new BadRequestException(err.message);
    } finally {
      await queryRunner.release();
    }
  }

  async sendUserMessage(payload: UserMessageDto) {
    const { title, message, userIds, channels } = payload;
    const queryRunner = this.connection.createQueryRunner();

    //remove duplicate user ids
    const uids = [...new Set(userIds)];
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      const users = await queryRunner.manager.find(User, {
        where: {
          uid: In(uids),
        },
      });

      if (channels.includes(NotificationType.TELEGRAM)) {
        const chatIds = users.filter((u) => !u.tgId);
        if (chatIds.length > 0) {
          throw new BadRequestException(
            `User ${chatIds.map((u) => u.uid).join(', ')} does not have telegram id`,
          );
        }
      }

      const createQueries = [];
      const tgErrors = [];

      for (const u of users) {
        if (channels.includes(NotificationType.INBOX)) {
          const notification = this.notificationRepository.create({
            title,
            message,
          });
          await queryRunner.manager.save(notification);

          const userNotification = queryRunner.manager.create(
            UserNotification,
            {
              isRead: false,
              user: u,
              notification,
            },
          );
          createQueries.push(userNotification);
        }

        if (channels.includes(NotificationType.TELEGRAM)) {
          try {
            const msg = `${title}\n ${message}`;
            await this.userNotificationBot.sendMessage(u.tgId, msg);
          } catch (error) {
            this.logger.error('Error sending message to telegram', error);
            tgErrors.push(u.tgId);
          }
        }
      }

      if (createQueries.length > 0) {
        await queryRunner.manager.save(UserNotification, createQueries);
        await queryRunner.commitTransaction();
      }

      if (tgErrors.length > 0) {
        const errorMsg = `Error sending Telegram message to ${tgErrors.join(', ')}`;
        const message = channels.includes(NotificationType.INBOX)
          ? `Inbox Message Sent successfully. ${errorMsg}`
          : errorMsg;

        return {
          isError: true,
          message,
        };
      } else {
        return {
          isError: false,
          message: 'Message sent successfully',
        };
      }
    } catch (error) {
      this.logger.error('Error sending message to user', error);
      await queryRunner.rollbackTransaction();
      if (error instanceof BadRequestException) {
        throw error;
      } else {
        throw new BadRequestException('Error sending message to user');
      }
    } finally {
      if (!queryRunner.isReleased) {
        await queryRunner.release();
      }
    }
  }

  private async notifyTelegram(chatIds: Array<string>, message: string) {
    try {
      for (const chatId of chatIds) {
        await this.bot.sendMessage(chatId, message);
      }
    } catch (error) {
      this.logger.error('Error sending message to telegram', error);
    }
  }

  private async notifySlack(message: string) {
    if (this.slackChannel && this.slackToken) {
      try {
        await this.slackClient.chat.postMessage({
          channel: this.slackChannel,
          text: message,
        });
      } catch (error) {
        this.logger.error('Error sending message to slack', error);
      }
    }
  }
}
