import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AdminService } from 'src/admin/admin.service';
import { UserRole } from 'src/shared/enum/role.enum';
import { Like, Repository } from 'typeorm';
import { PermissionAccessDto } from './dto/permission-access.dto';
import { PermissionAccess } from './entities/permission-access.entity';
import { Permission } from './entities/permission.entity';

@Injectable()
export class PermissionService {
  constructor(
    @InjectRepository(Permission)
    private permissionRepository: Repository<Permission>,
    @InjectRepository(PermissionAccess)
    private permissionAccessRepository: Repository<PermissionAccess>,
    @Inject(forwardRef(() => AdminService))
    private adminService: AdminService,
  ) {}

  async findAll(role?: string): Promise<Permission[]> {
    if (role != null) {
      return await this.permissionRepository.findBy({
        roles: Like(`%${role}%`),
      });
    }
    return await this.permissionRepository.find();
  }

  async findPermissionByCode(code: string): Promise<Permission> {
    return await this.permissionRepository.findOneBy({
      code,
    });
  }

  async findAllPermissionAccessByUser(
    userId: number,
    role: string,
  ): Promise<PermissionAccess[]> {
    return await this.permissionAccessRepository.findBy({
      userId,
      role,
    });
  }

  async assignPermission(payload: PermissionAccessDto): Promise<any> {
    switch (payload.userRole) {
      case UserRole.ADMIN:
        const admin = await this.adminService.findById(payload.userId);
        if (!admin) {
          return {
            error: 'User ID is not found.',
          };
        }
        break;
      default:
        return {
          error: 'This user role is not exist on the system.',
        };
    }

    const pa = await this.findAllPermissionAccessByUser(
      payload.userId,
      payload.role,
    );
    const newInserted = [];
    const deleted = [];

    // Find delete permissions
    pa.forEach((p) => {
      const found = payload.permissions.find((pp) => pp === p.permission.id);
      if (!found) {
        deleted.push(p);
      }
    });

    // Find insert permissions
    payload.permissions.forEach((p) => {
      const found = pa.find((pp) => pp.permission.id === p);
      if (!found) {
        newInserted.push(p);
      }
    });
    if (deleted.length > 0) {
      await this.permissionAccessRepository.delete(deleted);
    }

    const permissionList = await this.findAll(payload.role);
    const permissionAccesses = newInserted.map((p) => {
      return {
        role: payload.role,
        userId: payload.userId,
        permission: permissionList.find((pl) => pl.id === p),
        permissionId: Number(p),
      };
    });

    await this.permissionAccessRepository.insert(permissionAccesses);
    return {
      message: 'Created Successful',
    };
  }

  async verifyPermission(
    userId: number,
    permissionCode: string,
  ): Promise<PermissionAccess> {
    const permission = await this.findPermissionByCode(permissionCode);
    return await this.permissionAccessRepository.findOneBy({
      userId,
      permission,
    });
  }
}
