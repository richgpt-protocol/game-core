import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from 'src/config/config.service';
import { Brackets, Repository } from 'typeorm';
import { AdminAuditLog } from './entities/admin-audit-log.entity';
import { AuditLogDto } from './dto/audit-log.dto';
import { UserAuditLog } from './entities/user-audit-log.entity';
import { AdminType, UserRole } from 'src/shared/enum/role.enum';
import { IHandlerClass } from 'src/shared/interfaces/handler-class.interface';
import { Admin } from 'src/admin/entities/admin.entity';
import { User } from 'src/user/entities/user.entity';
import { AdminService } from 'src/admin/admin.service';

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AdminAuditLog)
    private adminAuditLogRepository: Repository<AdminAuditLog>,
    @InjectRepository(UserAuditLog)
    private userAuditLogRepository: Repository<UserAuditLog>,
    private configService: ConfigService,
    private adminService: AdminService,
  ) {}

  async adminInsert(payload: AdminAuditLog) {
    if (!this.configService.isDev) {
      return await this.adminAuditLogRepository.save(
        this.adminAuditLogRepository.create(payload),
      );
    }
    return;
  }

  async findAllAdminLogs(payload: AuditLogDto, adminId: number) {
    const admin = await this.adminService.findById(adminId);
    if (!admin) {
      throw new UnauthorizedException();
    }

    let selectedAdminIds = [];
    if (admin.adminType === AdminType.SUPERUSER) {
      const [adminList] = await this.adminService.findAdminList({
        page: 0,
        limit: 0,
        orderBy: '',
        orderSequence: 0,
      });

      selectedAdminIds = adminList.map((a) => a.id);
    }
    if (payload.page && payload.limit) {
      return await this.adminAuditLogRepository
        .createQueryBuilder('admin_audit_log')
        .leftJoinAndMapOne(
          'admin_audit_log.admin',
          Admin,
          'admin',
          'CONVERT(admin.id, CHAR) = admin_audit_log.userId',
        )
        .where(
          new Brackets((qb) => {
            selectedAdminIds.length > 0
              ? qb.where('admin_audit_log.userId IN (:...adminIds)', {
                  adminIds: selectedAdminIds,
                })
              : qb;
          }),
        )
        .orderBy('admin_audit_log.createdDate', 'DESC')
        .skip((payload.page - 1) * payload.limit)
        .take(payload.limit)
        .getManyAndCount();
    } else {
      return await this.adminAuditLogRepository
        .createQueryBuilder('admin_audit_log')
        .leftJoinAndMapOne(
          'admin_audit_log.admin',
          Admin,
          'admin',
          'CONVERT(admin.id, CHAR) = admin_audit_log.userId',
        )
        .where(
          new Brackets((qb) => {
            selectedAdminIds.length > 0
              ? qb.where('admin_audit_log.userId IN (:...adminIds)', {
                  adminIds: selectedAdminIds,
                })
              : qb;
          }),
        )
        .orderBy('admin_audit_log.createdDate', 'DESC')
        .getManyAndCount();
    }
  }

  async userInsert(payload: UserAuditLog) {
    if (!this.configService.isDev) {
      return await this.userAuditLogRepository.save(
        this.userAuditLogRepository.create(payload),
      );
    }
    return;
  }

  async findAllUserLogs(payload?: AuditLogDto) {
    if (payload.page && payload.limit) {
      return await this.userAuditLogRepository
        .createQueryBuilder('user_audit_log')
        .leftJoinAndMapOne(
          'user_audit_log.user',
          User,
          'user',
          'CONVERT(user.id, CHAR) = user_audit_log.userId',
        )
        .orderBy('user_audit_log.createdDate', 'DESC')
        .skip((payload.page - 1) * payload.limit)
        .take(payload.limit)
        .getMany();
    } else {
      return await this.userAuditLogRepository
        .createQueryBuilder('user_audit_log')
        .leftJoinAndMapOne(
          'user_audit_log.user',
          User,
          'user',
          'CONVERT(user.id, CHAR) = user_audit_log.userId',
        )
        .orderBy('user_audit_log.createdDate', 'DESC')
        .getMany();
    }
  }

  async addAuditLog(
    classInfo: IHandlerClass,
    req: any,
    ipAddress: string,
    content: string,
  ) {
    switch (req.user.role) {
      case UserRole.ADMIN:
        await this.adminInsert({
          module: classInfo.class,
          actions: classInfo.method,
          userId: req.user.userId,
          content,
          ipAddress,
        });
        break;
      case UserRole.USER:
        await this.userInsert({
          module: classInfo.class,
          actions: classInfo.method,
          userId: req.user.userId,
          content,
          ipAddress,
        });
        break;
    }
  }
}
