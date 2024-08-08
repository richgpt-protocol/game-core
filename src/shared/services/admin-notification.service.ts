import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Admin } from 'src/admin/entities/admin.entity';
import { Notification } from 'src/notification/entities/notification.entity';
import { UserNotification } from 'src/notification/entities/user-notification.entity';
import { Connection, Repository } from 'typeorm';
import * as TelegramBot from 'node-telegram-bot-api';
import { ConfigService } from 'src/config/config.service';

@Injectable()
export class AdminNotificationService {
  private bot: TelegramBot;
  private tg_admins: Array<string>;
  private TG_ADMIN_GROUP;
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

    this.tg_admins = this.configService.get('ADMIN_TG_USERNAMES').split(',');
    this.bot = new TelegramBot(
      this.configService.get('TG_ADMIN_NOTIFIER_BOT_TOKEN'),
      {
        polling: true,
      },
    );
  }

  async setAdminNotification(
    message: string,
    type: string,
    title: string,
    isBroadcast: boolean,
    walletTxId?: number,
    adminId?: number,
    sendToTelegram?: boolean,
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

      if (sendToTelegram) {
        await this.notifyTelegram([this.TG_ADMIN_GROUP], message);
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

  private async notifyTelegram(chatIds: Array<string>, message: string) {
    try {
      for (const chatId of chatIds) {
        await this.bot.sendMessage(chatId, message);
      }
    } catch (error) {
      console.error('Error sending message to telegram', error);
    }
  }
}
