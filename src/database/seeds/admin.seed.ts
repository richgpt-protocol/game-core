import { AdminType, UserRole } from '../../shared/enum/role.enum';
import { AdminStatus } from '../../shared/enum/status.enum';
import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import * as fs from 'fs';
import * as path from 'path';
import { Permission } from '../../permission/entities/permission.entity';
import { PermissionAccess } from '../../permission/entities/permission-access.entity';
import { PermissionAccessDto } from '../../permission/dto/permission-access.dto';
import * as bcrypt from 'bcrypt';

export default class CreateAdmins implements Seeder {
  /**
   * Track seeder execution.
   *
   * Default: false
   */
  track = false;

  public async run(dataSource: DataSource, factoryManager: SeederFactoryManager): Promise<void> {
    await this.insertPermissions(dataSource);

    const admins = await dataSource
      .createQueryBuilder()
      .insert()
      .into('admin')
      .values([
        {
          username: 'admin',
          name: 'Admin',
          emailAddress: 'admin@gmail.com',
          password: await bcrypt.hash('admin888*', 10),
          adminType: AdminType.SUPERUSER,
          createdBy: 'system',
          status: AdminStatus.ACTIVE,
        },
      ])
      .execute();

    const permissionList = await this.findAll(dataSource, AdminType.SUPERUSER);
    const permissions = permissionList.map((p) => p.id);

    await this.assignPermission(dataSource, {
      userId: admins.generatedMaps[0].id,
      userRole: UserRole.ADMIN,
      role: AdminType.SUPERUSER,
      permissions,
    });
  }

  private async insertPermissions(dataSource: DataSource) {
    const filePath = path.resolve(
      __dirname,
      '../sql_scripts/permission_script.sql',
    );

    let arr = fs.readFileSync(filePath.toString(), 'utf-8').split('\n');
    for (let i = 0; i < arr.length; i++) {
      await dataSource.query(arr[i]);
    }
  }

  private async findAll(
    dataSource: DataSource,
    role?: string,
  ): Promise<Permission[]> {
    if (role != null) {
      return await dataSource.query(
        `SELECT * FROM permission WHERE permission.roles LIKE '%${role}%'`,
      );
    }

    return await dataSource.query(`SELECT * FROM permission`);
  }

  private async findAllPermissionAccessByUser(
    dataSource: DataSource,
    userId: number,
    role: string,
  ): Promise<PermissionAccess[]> {
    return await dataSource.query(
      `SELECT * FROM permission_access WHERE "userId" = ${userId} AND role = '${role}'`,
    );
  }

  private async assignPermission(
    dataSource: DataSource,
    payload: PermissionAccessDto,
  ) {
    const pa = await this.findAllPermissionAccessByUser(
      dataSource,
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
      await dataSource
        .createQueryBuilder()
        .delete()
        .from('permission_access')
        .where('permissionId IN (:...ids)', { ids: deleted })
        .execute();
    }

    const permissionList = await this.findAll(dataSource, payload.role);
    const permissionAccesses = newInserted.map((p) => {
      return {
        role: payload.role,
        userId: payload.userId,
        permission: permissionList.find((pl) => pl.id === p),
        permissionId: Number(p),
      };
    });
    await dataSource
      .createQueryBuilder()
      .insert()
      .into('permission_access')
      .values(permissionAccesses)
      .execute();
  }
}
