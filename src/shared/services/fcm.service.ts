import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/user/entities/user.entity';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from 'src/config/config.service';
import * as admin from 'firebase-admin';
import { TelegramService } from './telegram.service';

@Injectable()
export class FCMService {
  private readonly logger = new Logger(FCMService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private dataSource: DataSource,
    private configService: ConfigService,
    private telegramnotifications: TelegramService,
  ) {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    const serviceAccount = {
      projectId: this.configService.get('PROJECT_ID'),
      type: this.configService.get('TYPE'),
      private_key_id: this.configService.get('PRIVATE_KEY_ID'),
      private_key: this.configService.get('PRIVATE_KEY').replace(/\\n/g, '\n'),
      client_email: this.configService.get('CLIENT_EMAIL'),
      client_id: this.configService.get('CLIENT_ID'),
      auth_uri: this.configService.get('AUTH_URI'),
      token_uri: this.configService.get('TOKEN_URI'),
      auth_provider_x509_cert_url: this.configService.get(
        'AUTH_PROVIDER_X509_CERT_URL',
      ),
      client_x509_cert_url: this.configService.get('CLIENT_X509_CERT_URL'),
      universe_domain: this.configService.get('UNIVERSE_DOMAIN'),
    };

    if (!admin.apps.length) {
      try {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          storageBucket: this.configService.get('STORAGE_BUCKET'),
        });
        this.logger.log('Firebase initialized successfully');
      } catch (error) {
        this.logger.error('Error initializing Firebase:', error.message);
        throw new Error('Firebase initialization failed');
      }
    }
  }

  async sendUserFirebase_TelegramNotification(
    userId: number,
    title: string,
    message: string,
  ) {
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
      if (user.tgId && user.tgId.trim().length > 0) {
        try {
          await this.telegramnotifications.sendOneTelegram(user.tgId, message);
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
          this.logger.log(
            `Firebase notification sent to FCM token: ${user.fcm}`,
          );
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

  async firebaseSendAllUserNotification(
    image: string,
    title: string,
    message: string,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    const users = await queryRunner.manager.find(User, {
      select: {
        id: true,
        fcm: true,
      },
      relations: {
        wallet: true,
      },
    });

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
        this.logger.log(
          `Notification Success for User ${user.id}: ${JSON.stringify(response)}`,
        );
        results.push({ userId: user.id, status: 'success', response });
      } catch (error) {
        this.logger.error(
          `Notification Failed for User ${user.id}:`,
          error.message,
        );
        results.push({
          userId: user.id,
          status: 'failed',
          error: error.message,
        });
      }
    }

    return results;
  }
}
