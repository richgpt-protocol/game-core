import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Admin } from 'src/admin/entities/admin.entity';
import { User } from 'src/user/entities/user.entity';
import { Notification } from 'src/notification/entities/notification.entity';
import { UserNotification } from 'src/notification/entities/user-notification.entity';
import { Connection, DataSource, Repository } from 'typeorm';
import * as TelegramBot from 'node-telegram-bot-api';
import { ConfigService } from 'src/config/config.service';
import { WebClient } from '@slack/web-api';
import * as admin from 'firebase-admin';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AdminNotificationService {
  private readonly logger = new Logger(AdminNotificationService.name);

  private firebasetokens = new Map<string, string>(); 

  private bot: TelegramBot;
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
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private dataSource: DataSource,
    private configService: ConfigService,
    private connection: Connection,
  ) {
    this.TG_ADMIN_GROUP = this.configService.get('ADMIN_TG_CHAT_ID');

    // this.tg_admins = this.configService.get('ADMIN_TG_USERNAMES').split(',');
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

    this.initializeFirebase();
  }

  private initializeFirebase() {
     const serviceAccount =    {
      projectId: this.configService.get('PROJECT_ID'),
      clientEmail: this.configService.get('CLIENT_EMAIL'),
      privateKey: this.configService.get('PRIVATE_KEY').replace(/\\n/g, '\n'),
      type: this.configService.get('TYPE'),
      project_id: this.configService.get('PROJECT_ID'),
      private_key_id: this.configService.get('PRIVATE_KEY_ID'),
      private_key: this.configService.get('PRIVATE_KEY').replace(/\\n/g, '\n'),
      client_email: this.configService.get('CLIENT_EMAIL'),
      client_id: this.configService.get('CLIENT_ID'),
      auth_uri: this.configService.get('AUTH_URI'),
      token_uri: this.configService.get('TOKEN_URI'),
      auth_provider_x509_cert_url: this.configService.get('AUTH_PROVIDER_X509_CERT_URL'),
      client_x509_cert_url:this.configService.get('CLIENT_X509_CERT_URL'),
      universe_domain:this.configService.get('UNIVERSE_DOMAIN')
    }

    if (!admin.apps.length) {
      try {
        admin.initializeApp({
          credential: admin.credential.cert(
            serviceAccount
        ),
          storageBucket: this.configService.get('STORAGE_BUCKET'),
        });
        this.logger.log('Firebase initialized successfully');
      } catch (error) {
        this.logger.error('Error initializing Firebase:', error.message);
        throw new Error('Firebase initialization failed');
      }
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

  async sendUserFirebase_TelegramNotification(userId: number, title: string, message: string) {
      try {
        const queryRunner = this.dataSource.createQueryRunner();
        const user = await queryRunner.manager.findOne(User, {
          where: {
            id: userId,
          },
        });
        if (!user) {
          this.logger.warn(`User with ID ${userId} not found.`);
          return;
        }    
        //telegram
        if (user.tgId && user.tgId.trim().length > 0) {
          try {
            await this.bot.sendMessage(user.tgId, message);
            this.logger.log(`Telegram notification sent to tgId: ${user.tgId}`);
          } catch (telegramError) {
            this.logger.error(
              `Error sending Telegram notification to tgId: ${user.tgId}`,
              telegramError.message,
            );
          }
        } else {
          this.logger.warn(`Telegram ID is empty for user ID: ${userId}`);
        }
        if (user.fcm && user.fcm.trim().length > 0) {
          try {
              const payload: admin.messaging.Message = {
                token: user.fcm,
                notification: {
                  title,
                  body: message,
                },
              };
              await admin.messaging().send(payload);
              this.logger.log(`Firebase notification sent to FCM token: ${user.fcm}`);
            } catch (firebaseError) {
              this.logger.error(
                `Error sending Firebase notification to FCM token: ${user.fcm}`,
                firebaseError.message,
              );
            }
        } else {
          this.logger.warn(`FCM token is empty for user ID: ${userId}`);
        }
      } catch (error) {
        this.logger.error(`Error sending notification: `, error.message);
      }
  }

  async firebaseSendAllUserNotification(image: string, title: string, message: string) {
    const data = await this.userRepository
      .createQueryBuilder('user')
      .select([
        'user.fcm',
        'user.id',
        'wallet.walletAddress',
      ])
      .leftJoin('user.wallet', 'wallet')
      .getManyAndCount();
    const users = data[0];
    const results = [];

    for (const user of users) {
      try {
        const payload: admin.messaging.Message = {
          token: user.fcm,
          notification: {
            title,
            body: message,
            imageUrl: image,
          },
        };
  
        const response = await admin.messaging().send(payload);
        this.logger.log(`Notification Success for User ${user.id}: ${JSON.stringify(response)}`);
        results.push({ userId: user.id, status: 'success', response });
      } catch (error) {
        this.logger.error(`Notification Failed for User ${user.id}:`, error.message);
        results.push({ userId: user.id, status: 'failed', error: error.message });
      }
    }

    return results;
  }
}
