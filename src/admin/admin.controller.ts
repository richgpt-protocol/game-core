/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
  Put,
  Request,
  Sse,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiHeader, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { UserRole } from 'src/shared/enum/role.enum';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { HandlerClass } from 'src/shared/decorators/handler-class.decorator';
import { IpAddress } from 'src/shared/decorators/ip-address.decorator';
import { IHandlerClass } from 'src/shared/interfaces/handler-class.interface';
import { Secure, SecureEJS } from 'src/shared/decorators/secure.decorator';
import { PermissionEnum } from 'src/shared/enum/permission.enum';
import { ResponseListVo, ResponseVo } from 'src/shared/vo/response.vo';
import { UpdateAdminNotificationDto } from './dto/admin-notification.dto';
import { AdminDto, GetAdminListDto, UpdateAdminDto } from './dto/admin.dto';

@ApiTags('Admin')
@Controller('api/v1/admin')
export class AdminController {
  constructor(
    private adminService: AdminService,
    private auditLogService: AuditLogService,
  ) {}

  @Secure(PermissionEnum.GET_ADMIN, UserRole.ADMIN)
  @Get('get-admin-profile')
  @ApiResponse({
    status: 200,
    description: 'Successful Response',
    type: ResponseVo,
  })
  async getAdminProfile(
    @Request() req,
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
  ): Promise<ResponseVo<any>> {
    const { password, loginAttempt, ...result } =
      await this.adminService.findById(req.user.userId);

    await this.auditLogService.addAuditLog(
      classInfo,
      req,
      ipAddress,
      'Get Admin Profile: ' + JSON.stringify(req.user.userId),
    );

    return {
      statusCode: HttpStatus.OK,
      data: result,
      message: 'Get Admin Profile Successful.',
    };
  }

  // @Secure(PermissionEnum.GET_ADMIN, UserRole.ADMIN)
  // @Get('get-admin-notification')
  // @ApiResponse({
  //   status: 200,
  //   description: 'Successful Response',
  //   type: ResponseVo,
  // })
  // async getAdminNotification(
  //   @Request() req,
  //   @IpAddress() ipAddress,
  //   @HandlerClass() classInfo: IHandlerClass,
  // ): Promise<ResponseVo<any>> {
  //   const result = await this.adminService.getAdminNotifications(
  //     req.user.userId,
  //   );

  //   await this.auditLogService.addAuditLog(
  //     classInfo,
  //     req,
  //     ipAddress,
  //     'Get Admin Notification: ' + JSON.stringify(req.user.userId),
  //   );

  //   return {
  //     statusCode: HttpStatus.OK,
  //     data: result,
  //     message: 'Get Admin Notification Successful',
  //   };
  // }

  // @Secure(PermissionEnum.GET_ADMIN, UserRole.ADMIN)
  // @Put('update-admin-notification')
  // @ApiResponse({
  //   status: 200,
  //   description: 'Successful Response',
  //   type: ResponseVo,
  // })
  // async updateAdminNotification(
  //   @Request() req,
  //   @IpAddress() ipAddress,
  //   @HandlerClass() classInfo: IHandlerClass,
  //   @Body() payload: UpdateAdminNotificationDto,
  // ): Promise<ResponseVo<any>> {
  //   const admin = await this.adminService.findById(req.user.userId);

  //   if (!admin) {
  //     throw new BadRequestException('Admin is not found.');
  //   }

  //   const result = await this.adminService.updateNotificationRead(
  //     payload,
  //     admin.id,
  //   );

  //   if (result.affected > 0) {
  //     await this.auditLogService.addAuditLog(
  //       classInfo,
  //       req,
  //       ipAddress,
  //       'Update Admin Notification: ' + JSON.stringify(payload),
  //     );

  //     return {
  //       statusCode: HttpStatus.OK,
  //       data: {},
  //       message: 'Update Admin Notification Successful',
  //     };
  //   } else {
  //     return {
  //       statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  //       data: {},
  //       message: 'Failed to update Admin Notification.',
  //     };
  //   }
  // }

  // @Secure(PermissionEnum.GET_ADMIN, UserRole.ADMIN)
  // @Delete('clear-all-notifications')
  // @ApiResponse({
  //   status: 200,
  //   description: 'Successful Response',
  //   type: ResponseVo,
  // })
  // async clearAllNotifications(
  //   @Request() req,
  //   @IpAddress() ipAddress,
  //   @HandlerClass() classInfo: IHandlerClass,
  // ): Promise<ResponseVo<any>> {
  //   const admin = await this.adminService.findById(req.user.userId);

  //   if (!admin) {
  //     throw new UnauthorizedException('Admin is not found.');
  //   }
  //   await this.adminService.clearAllNotifications(admin.id);
  //   await this.auditLogService.addAuditLog(
  //     classInfo,
  //     req,
  //     ipAddress,
  //     'Clear All Admin Notifications.',
  //   );

  //   return {
  //     statusCode: HttpStatus.OK,
  //     data: {},
  //     message: 'Clear All Admin Notifications Successful',
  //   };
  // }

  @Secure(PermissionEnum.GET_ADMIN, UserRole.ADMIN)
  @Post('get-admin-list')
  @ApiResponse({
    status: 200,
    description: 'Successful Response',
    type: ResponseListVo,
  })
  async getAdminList(
    @Request() req,
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
    @Body() payload: GetAdminListDto,
  ): Promise<ResponseListVo<any>> {
    const [result, total] = await this.adminService.findAdminList(payload);

    await this.auditLogService.addAuditLog(
      classInfo,
      req,
      ipAddress,
      'Retrieved Admin List successfully.',
    );

    return {
      statusCode: HttpStatus.OK,
      data: result,
      message: 'Retrieved Admin List successfully.',
      total,
    };
  }

  @Secure(PermissionEnum.GET_ADMIN, UserRole.ADMIN)
  @Get('get-admin/:id')
  @ApiResponse({
    status: 200,
    description: 'Successful Response',
    type: ResponseVo,
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'Admin ID',
  })
  async getAdmin(
    @Request() req,
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
    @Param() params,
  ): Promise<ResponseVo<any>> {
    const result = await this.adminService.findAdmin(Number(params.id));

    await this.auditLogService.addAuditLog(
      classInfo,
      req,
      ipAddress,
      'Retrieved Admin successfully: ' + params.id,
    );

    return {
      statusCode: HttpStatus.OK,
      data: result,
      message: 'Retrieved Admin successfully.',
    };
  }

  @SecureEJS(PermissionEnum.GET_ADMIN, UserRole.ADMIN)
  @Post('create-admin')
  @ApiResponse({
    status: 200,
    description: 'Successful Response',
    type: ResponseVo,
  })
  async createAdmin(
    @Request() req,
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
    @Body() payload: AdminDto,
  ): Promise<ResponseVo<any>> {
    if (req.user.adminType != 'S') {
      throw new UnauthorizedException('Only superuser can create admin.');
    }
    const admin = await this.adminService.create(payload);

    delete payload.password; // Hide password
    await this.auditLogService.addAuditLog(
      classInfo,
      req,
      ipAddress,
      'Create new admin: ' + JSON.stringify(payload),
    );

    if (admin) {
      delete admin.password; // Hide password

      return {
        statusCode: HttpStatus.OK,
        data: admin,
        message: 'Created new admin successfully.',
      };
    } else {
      return {
        statusCode: HttpStatus.OK,
        data: {},
        message: 'Failed to create admin.',
      };
    }
  }

  @SecureEJS(PermissionEnum.GET_ADMIN, UserRole.ADMIN)
  @Put('update-admin/:id')
  @ApiResponse({
    status: 200,
    description: 'Successful Response',
    type: ResponseVo,
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'Admin ID',
  })
  async updateAdmin(
    @Request() req,
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
    @Param() params,
    @Body() payload: UpdateAdminDto,
  ): Promise<ResponseVo<any>> {
    if (req.user.adminType != 'S') {
      throw new UnauthorizedException('Only superuser can update admin.');
    }
    const success = await this.adminService.update(params.id, payload);

    await this.auditLogService.addAuditLog(
      classInfo,
      req,
      ipAddress,
      'Update new admin: ' + JSON.stringify(payload),
    );

    if (success) {
      return {
        statusCode: HttpStatus.OK,
        data: {},
        message: 'Updated admin successfully.',
      };
    } else {
      return {
        statusCode: HttpStatus.OK,
        data: {},
        message: 'Failed to update admin.',
      };
    }
  }

}
