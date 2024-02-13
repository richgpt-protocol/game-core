import { Controller, Get, Request, Query } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { HandlerClass } from 'src/shared/decorators/handler-class.decorator';
import { IpAddress } from 'src/shared/decorators/ip-address.decorator';
import { Secure } from 'src/shared/decorators/secure.decorator';
import { PermissionEnum } from 'src/shared/enum/permission.enum';
import { UserRole } from 'src/shared/enum/role.enum';
import { IHandlerClass } from 'src/shared/interfaces/handler-class.interface';
import { AuditLogService } from './audit-log.service';
import { AuditLogDto } from './dto/audit-log.dto';

@ApiTags('Audit Logs')
@Controller('api/v1/audit-log')
export class AuditLogController {
  constructor(private auditLogService: AuditLogService) {}

  @Secure(PermissionEnum.GET_AUDIT_LOG, UserRole.ADMIN)
  @Get()
  @ApiResponse({ status: 200, description: 'Successful Response' })
  async getAdminLogs(
    @Request() req,
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
    @Query() query: AuditLogDto,
  ) {
    let result = [];
    let total = 0;
    switch (query.role) {
      case UserRole.ADMIN:
        await this.auditLogService.adminInsert({
          module: classInfo.class,
          actions: classInfo.method,
          userId: req.user.userId,
          content: 'Get Admin Logs: ' + JSON.stringify(query),
          ipAddress,
        });
        [result, total] = await this.auditLogService.findAllAdminLogs(
          query,
          req.user.userId,
        );
        break;
      case UserRole.USER:
        await this.auditLogService.adminInsert({
          module: classInfo.class,
          actions: classInfo.method,
          userId: req.user.userId,
          content: 'Get User Logs: ' + JSON.stringify(query),
          ipAddress,
        });
        result = await this.auditLogService.findAllUserLogs(query);
        break;
      // TODO Add New Roles
    }

    return {
      success: true,
      data: result,
      total,
    };
  }
}
