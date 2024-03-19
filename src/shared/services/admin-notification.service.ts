import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Admin } from 'src/admin/entities/admin.entity';
import { Notification } from 'src/notification/entities/notification.entity';
import { UserNotification } from 'src/notification/entities/user-notification.entity';
import { Connection, Repository } from 'typeorm';

@Injectable()
export class AdminNotificationService {
  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(UserNotification)
    private userNotificationRepository: Repository<UserNotification>,
    @InjectRepository(Admin)
    private adminRepository: Repository<Admin>,
    private connection: Connection,
  ) {}

  async setAdminNotification(
    message: string,
    type: string,
    title: string,
    isBroadcast: boolean,
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
          walletTx: walletTxId
            ? { id: walletTxId }
            : null,
        }),
      );

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
}
