import { AdminType, UserRole } from '../../shared/enum/role.enum';
import { AdminStatus } from '../../shared/enum/status.enum';
import { Connection } from 'typeorm';
import { Factory, Seeder } from 'typeorm-seeding';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { Permission } from '../../permission/entities/permission.entity';
import { PermissionAccess } from '../../permission/entities/permission-access.entity';
import { PermissionAccessDto } from '../../permission/dto/permission-access.dto';

export default class CreateAdmins implements Seeder {
  public async run(factory: Factory, connection: Connection): Promise<void> {
    await this.insertPermissions(connection);

    const admins = await connection
      .createQueryBuilder()
      .insert()
      .into('admin')
      .values([
        {
          username: 'admin',
          name: 'Admin',
          emailAddress: 'soonlai814@gmail.com',
          password: await bcrypt.hash('Zaq12wsx', 10),
          adminType: AdminType.SUPERUSER,
          createdBy: 'system',
          status: AdminStatus.ACTIVE,
        },
      ])
      .execute();

    const permissionList = await this.findAll(connection, AdminType.SUPERUSER);
    const permissions = permissionList.map((p) => p.id);

    await this.assignPermission(connection, {
      userId: admins.generatedMaps[0].id,
      userRole: UserRole.ADMIN,
      role: AdminType.SUPERUSER,
      permissions,
    });
  }

  private async insertPermissions(connection: Connection) {
    const filePath = path.resolve(
      __dirname,
      '../../../sql_scripts/permission_script.sql',
    );

    return new Promise((resolve, reject) => {
      fs.readFile(filePath.toString(), 'utf-8', (err, data) => {
        if (err) {
          reject(err);
        } else {
          const arr = data.split('\n');
          arr.forEach(async (script) => {
            await connection.query(script);
          });
          resolve(data);
        }
      });
    });
  }

  private async findAll(
    connection: Connection,
    role?: string,
  ): Promise<Permission[]> {
    if (role != null) {
      return await connection.query(
        `SELECT * FROM permission WHERE permission.roles LIKE '%${role}%'`,
      );
    }

    return await connection.query(`SELECT * FROM permission`);
  }

  private async findAllPermissionAccessByUser(
    connection: Connection,
    userId: number,
    role: string,
  ): Promise<PermissionAccess[]> {
    return await connection.query(
      `SELECT * FROM permission_access WHERE "userId" = ${userId} AND role = '${role}'`,
    );
  }

  private async assignPermission(
    connection: Connection,
    payload: PermissionAccessDto,
  ) {
    const pa = await this.findAllPermissionAccessByUser(
      connection,
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
      await connection
        .createQueryBuilder()
        .delete()
        .from('permission_access')
        .where('permissionId IN (:...ids)', { ids: deleted })
        .execute();
    }

    const permissionList = await this.findAll(connection, payload.role);
    const permissionAccesses = newInserted.map((p) => {
      return {
        role: payload.role,
        userId: payload.userId,
        permission: permissionList.find((pl) => pl.id === p),
        permissionId: Number(p),
      };
    });
    await connection
      .createQueryBuilder()
      .insert()
      .into('permission_access')
      .values(permissionAccesses)
      .execute();
  }
}
