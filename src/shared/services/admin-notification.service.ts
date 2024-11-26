import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
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
import { delay, Job } from 'bullmq';
import { QueueService } from 'src/queue/queue.service';
import { QueueName, QueueType } from '../enum/queue.enum';

@Injectable()
export class AdminNotificationService implements OnModuleInit {
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
    private queueService: QueueService,
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

  onModuleInit() {
    this.queueService.registerHandler(
      QueueName.MESSAGE,
      QueueType.SEND_TELEGRAM_MESSAGE,
      {
        jobHandler: this.sendTelegramMessage.bind(this),
        failureHandler: this.failedTelegramMessage.bind(this),
      },
    );
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
      throw new BadRequestException(err.message);
    } finally {
      await queryRunner.release();
    }
  }

  async sendUserMessage(payload: UserMessageDto) {
    const { title, message, userIds, channels } = payload;
    const queryRunner = this.connection.createQueryRunner();

    //remove duplicate user ids
    const trimmedUserIds = userIds.map((str) => str.trim()); // trim all user ids

    const uids = [...new Set(trimmedUserIds)];
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      const users = await queryRunner.manager.find(User, {
        where: {
          uid: In(uids),
        },
      });

      if (users.length === 0) {
        throw new BadRequestException('No users found');
      }

      const createQueries = [];
      const tgErrors = [];

      const notification = new Notification();
      notification.title = title;
      notification.message = message;
      await queryRunner.manager.save(notification);

      for (const u of users) {
        if (channels.includes(NotificationType.INBOX)) {
          const userNotification = queryRunner.manager.create(
            UserNotification,
            {
              isRead: false,
              user: u,
              notification,
              channel: NotificationType.INBOX,
            },
          );
          createQueries.push(userNotification);
        }

        if (channels.includes(NotificationType.TELEGRAM) && u.tgId) {
          const messageId = new Date().getTime().toString();
          const jobId = `message-${messageId}`;
          const msg = `${title}\n\n${message}`;

          try {
            await this.queueService.addJob(QueueName.MESSAGE, jobId, {
              tgId: u.tgId,
              message: msg,
              messageId,
              queueType: QueueType.SEND_TELEGRAM_MESSAGE,
            });

            const userNotification = queryRunner.manager.create(
              UserNotification,
              {
                isRead: false,
                user: u,
                notification,
                channel: NotificationType.TELEGRAM,
                status: 'PENDING',
                messageId,
              },
            );
            createQueries.push(userNotification);
          } catch (error) {
            this.logger.error('Error sending message to telegram', error);
            tgErrors.push(u.uid);
            continue;
          }
        } else {
          tgErrors.push(u.uid);
        }
      }

      if (createQueries.length > 0) {
        await queryRunner.manager.save(UserNotification, createQueries);
        await queryRunner.commitTransaction();
      }

      if (tgErrors.length > 0) {
        const errorMsg = `Failed sending Telegram message to ${tgErrors.join(',')}`;
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

  private async sendTelegramMessage(job: Job) {
    console.log(job.data);
    const { message, tgId, messageId } = job.data;
    await this.userNotificationBot.sendMessage(tgId, message);

    const userNotification = await this.userNotificationRepository.findOneBy({
      messageId,
    });

    if (userNotification) {
      await this.userNotificationRepository.update(userNotification.id, {
        status: 'SENT',
      });
    }

    await delay(1000);
  }

  private async failedTelegramMessage(job: Job, error: Error) {
    const { messageId } = job.data;

    this.logger.error(
      `Job ${job.id} failed with error: ${error.message}. Attempts ${job.attemptsMade}`,
    );
    this.logger.error(error);

    const userNotification = await this.userNotificationRepository.findOneBy({
      messageId,
    });

    if (userNotification) {
      await this.userNotificationRepository.update(userNotification.id, {
        status: 'FAILED',
        remarks: error.message,
      });
    }
  }
}
