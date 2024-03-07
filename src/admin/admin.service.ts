import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Connection, In, Like, Repository } from 'typeorm';
import { Admin } from './entities/admin.entity';
import { AdminDto, GetAdminListDto } from './dto/admin.dto';
import { buildFilterCriterias } from 'src/shared/utils/pagination.util';
import { ObjectUtil } from 'src/shared/utils/object.util';
import * as bcrypt from 'bcrypt';
import {
  AdminNotificationDto,
  UpdateAdminNotificationDto,
} from './dto/admin-notification.dto';
import { Notification } from '../notification/entities/notification.entity';
import { DateUtil } from 'src/shared/utils/date.util';
import { PermissionService } from 'src/permission/permission.service';
import { UserRole } from 'src/shared/enum/role.enum';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(Admin)
    private adminRepository: Repository<Admin>,
    // @InjectRepository(Notification)
    // private notificationRepository: Repository<Notification>,
    private connection: Connection,
    @Inject(forwardRef(() => PermissionService))
    private permissionService: PermissionService,
  ) {}

  async findById(id: number): Promise<Admin> {
    return await this.adminRepository
      .createQueryBuilder('row')
      .select('row')
      .addSelect('row.password')
      .addSelect('row.loginAttempt')
      .where({
        id,
      })
      .getOne();
  }

  async findOne(username: string): Promise<Admin> {
    return await this.adminRepository
      .createQueryBuilder('row')
      .select('row')
      .addSelect('row.password')
      .addSelect('row.loginAttempt')
      .where({
        username,
      })
      .getOne();
  }

  async findExistEmail(email: string): Promise<Admin> {
    return await this.adminRepository
      .createQueryBuilder('row')
      .select('row')
      .addSelect('row.password')
      .addSelect('row.loginAttempt')
      .where({
        emailAddress: email,
      })
      .getOne();
  }

  async findByEmailAndUsername(email: string, username: string) {
    return await this.adminRepository
      .createQueryBuilder('row')
      .select('row')
      .addSelect('row.password')
      .addSelect('row.loginAttempt')
      .where({
        emailAddress: email,
        username,
      })
      .getOne();
  }

  async findAdmin(id: number) {
    return await this.adminRepository.findOneBy({
      id,
    });
  }

  async findAdminList(payload: GetAdminListDto) {
    if (payload.orderBy != null && payload.orderBy != '') {
      payload.orderBy = 'admin.' + payload.orderBy;
    }

    const { filter, pagination, order } = buildFilterCriterias(payload);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { page, limit, orderBy, orderSequence, ...data } = payload;
    for (const params of Object.keys(data)) {
      if (
        payload[params] != null &&
        payload[params] !== '' &&
        payload[params] !== 0
      ) {
        switch (params) {
          case 'fromDate':
          case 'toDate':
            break;
          default:
            Object.assign(filter, {
              [params]: Like(`%${payload[params]}%`),
            });
        }
      }
    }

    let query = this.adminRepository
      .createQueryBuilder('admin')
      .select([
        'admin.id',
        'admin.username',
        'admin.name',
        'admin.emailAddress',
        'admin.adminType',
        'admin.status',
        'admin.createdBy',
        'admin.createdDate',
      ])
      .where({
        ...filter,
      });

    if (payload.fromDate != null && payload.fromDate != '') {
      query = query.andWhere('admin.createdDate >= :fromDate', {
        fromDate: payload.fromDate,
      });
    }

    if (payload.toDate != null && payload.toDate != '') {
      const toDate = DateUtil.formatDate(
        DateUtil.addDays(DateUtil.parseStringtoDate(payload.toDate), 1),
        'YYYY-MM-DD',
      );

      query = query.andWhere('admin.createdDate <= :toDate', {
        toDate,
      });
    }

    query = query
      .take(ObjectUtil.isEmpty(pagination) ? null : pagination.take)
      .skip(ObjectUtil.isEmpty(pagination) ? null : pagination.skip)
      .orderBy(order);

    return await query.getManyAndCount();
  }

  async update(id: number, payload: any) {
    const { ...data } = payload;

    const admin = await this.findById(id);
    if (!admin) {
      throw new NotFoundException('Invalid Admin');
    }

    const result = await this.adminRepository.update(id, {
      ...data,
    });

    return result.affected > 0;
  }

  async create(payload: AdminDto) {
    const hashed = await bcrypt.hash(payload.password, 10);
    const admin = await this.findOne(payload.username);

    if (admin) {
      throw new ConflictException(
        `Admin '${payload.username}' is already exist.`,
      );
    }

    const email = await this.findExistEmail(payload.emailAddress);
    if (email) {
      throw new ConflictException(`Email Address is already exist.`);
    }

    const result = await this.adminRepository.save(
      this.adminRepository.create({
        ...payload,
        password: hashed,
        createdBy: 'system',
        loginAttempt: 0,
      }),
    );

    if (result) {
      const permissionList = await this.permissionService.findAll(
        payload.adminType,
      );

      const assignResult = await this.permissionService.assignPermission({
        userId: result.id,
        userRole: UserRole.ADMIN,
        role: payload.adminType,
        permissions: permissionList.map((p) => p.id),
      });

      if (assignResult.error) {
        throw new BadRequestException(assignResult.error);
      }
    }

    return result;
  }

  // async getAdminNotifications(id: number) {
  //   const admin = await this.findById(id);
  //   return await this.adminNotificationRepository
  //     .createQueryBuilder('row')
  //     .leftJoinAndSelect('row.notification', 'notification')
  //     .where({
  //       admin,
  //     })
  //     .orderBy('notification.createdDate', 'DESC')
  //     .getMany();
  // }

  // async updateNotificationRead(
  //   payload: UpdateAdminNotificationDto,
  //   adminId: number,
  // ) {
  //   const admin = await this.findById(adminId);
  //   return await this.adminNotificationRepository
  //     .createQueryBuilder()
  //     .update(AdminNotification)
  //     .set({
  //       isRead: true,
  //       readDateTime: new Date(),
  //     })
  //     .where({
  //       id: In(payload.notificationIds),
  //       admin,
  //     })
  //     .execute();
  // }

  // async createAdminNotification(payload: AdminNotificationDto) {
  //   const queryRunner = this.connection.createQueryRunner();

  //   await queryRunner.connect();
  //   await queryRunner.startTransaction();

  //   try {
  //     const notification = await this.notificationRepository.save(
  //       this.notificationRepository.create({
  //         type: payload.type,
  //         title: payload.title,
  //         message: payload.message,
  //       }),
  //     );

  //     if (notification) {
  //       let admins = [];
  //       if (payload.filterAdminIds && payload.filterAdminIds.length > 0) {
  //         admins = await this.adminRepository
  //           .createQueryBuilder('row')
  //           .select('row')
  //           .whereInIds(payload.filterAdminIds)
  //           .getMany();
  //       } else {
  //         admins = await this.adminRepository.find();
  //       }

  //       const createQueries = [];
  //       admins.forEach((a) => {
  //         createQueries.push(
  //           this.adminNotificationRepository.create({
  //             admin: a,
  //             notification,
  //           }),
  //         );
  //       });
  //       await this.adminNotificationRepository.save(createQueries);
  //     }
  //     await queryRunner.commitTransaction();
  //   } catch (err) {
  //     await queryRunner.rollbackTransaction();
  //     this.logger.error(err);
  //   } finally {
  //     await queryRunner.release();
  //   }
  // }

  // async clearAllNotifications(adminId: number) {
  //   const admin = await this.findById(adminId);

  //   await this.adminNotificationRepository
  //     .createQueryBuilder()
  //     .softDelete()
  //     .where({
  //       admin,
  //     })
  //     .execute();
  // }
}
