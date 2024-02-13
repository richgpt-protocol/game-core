import { Controller, Get, HttpStatus, Query, Request } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { HandlerClass } from 'src/shared/decorators/handler-class.decorator';
import { IpAddress } from 'src/shared/decorators/ip-address.decorator';
import { Secure } from 'src/shared/decorators/secure.decorator';
import { PermissionEnum } from 'src/shared/enum/permission.enum';
import { UserRole } from 'src/shared/enum/role.enum';
import { IHandlerClass } from 'src/shared/interfaces/handler-class.interface';
import { ResponseVo } from 'src/shared/vo/response.vo';
import { GetPermissionAccessDto } from './dto/get-permission-access.dto';
import { PermissionDto } from './dto/permission.dto';
import { PermissionService } from './permission.service';

@ApiTags('Permission')
@Controller('api/v1/permission')
export class PermissionController {
  constructor(
    private permissionService: PermissionService,
    private auditLogService: AuditLogService,
  ) {}

  @Secure(PermissionEnum.GET_PERMISSION, UserRole.ADMIN)
  @Get('get-all-permission')
  @ApiResponse({
    status: 200,
    description: 'Successful Response',
    type: ResponseVo,
  })
  async getAllPermission(
    @Request() req,
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
    @Query() payload: PermissionDto,
  ): Promise<ResponseVo<any>> {
    await this.addAuditLog(
      payload,
      classInfo,
      req,
      ipAddress,
      'Get All Permission: ' + JSON.stringify(payload),
    );

    const permissions = await this.permissionService.findAll(payload.role);
    return {
      statusCode: HttpStatus.OK,
      message: 'Get All Permission Successful.',
      data: permissions,
    };
  }

  @Secure(PermissionEnum.GET_PERMISSION_ACCESS, UserRole.ADMIN)
  @Get('get-permission-access')
  @ApiResponse({
    status: 200,
    description: 'Successful Response',
    type: ResponseVo,
  })
  async getPermissionAccess(
    @Request() req,
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
    @Query() payload: GetPermissionAccessDto,
  ): Promise<ResponseVo<any>> {
    await this.addAuditLog(
      payload,
      classInfo,
      req,
      ipAddress,
      'Get Permission Access: ' + JSON.stringify(payload),
    );

    const accesses = await this.permissionService.findAllPermissionAccessByUser(
      payload.userId,
      payload.role,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Get Permission Accesses Successful',
      data: accesses.map((access) => access.permission),
    };
  }

  private async addAuditLog(
    query: any,
    classInfo: IHandlerClass,
    req: any,
    ipAddress: string,
    content: string,
  ) {
    switch (query.role) {
      case UserRole.ADMIN:
        // Admin is able to assign permissions to admin, merchant and captains
        await this.auditLogService.adminInsert({
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
