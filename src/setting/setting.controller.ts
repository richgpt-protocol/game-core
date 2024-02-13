import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Put,
  Request,
} from '@nestjs/common';
import { ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { HandlerClass } from 'src/shared/decorators/handler-class.decorator';
import { IpAddress } from 'src/shared/decorators/ip-address.decorator';
import { Secure } from 'src/shared/decorators/secure.decorator';
import { PermissionEnum } from 'src/shared/enum/permission.enum';
import { UserRole } from 'src/shared/enum/role.enum';
import { IHandlerClass } from 'src/shared/interfaces/handler-class.interface';
import { ResponseVo } from 'src/shared/vo/response.vo';
import { SettingDto } from './dto/setting.dto';
import { SettingService } from './setting.service';

@ApiTags('Setting')
@Controller('api/v1/setting')
export class SettingController {
  constructor(
    private auditLogService: AuditLogService,
    private settingService: SettingService,
  ) {}

  @Get('get-server-time')
  @ApiResponse({
    status: 200,
    description: 'Successful Response',
    type: ResponseVo,
  })
  async getServerTime(): Promise<ResponseVo<any>> {
    return {
      statusCode: HttpStatus.OK,
      message: '',
      data: {
        time: new Date().getTime(),
      },
    };
  }

  @Secure(PermissionEnum.GET_SETTING, UserRole.ADMIN)
  @Get('get-setting')
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successful Response',
    type: ResponseVo,
  })
  async getSetting(
    @Request() req,
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
  ): Promise<ResponseVo<any>> {
    const result = await this.settingService.getAllSettings();
    let res = [];
    res = result.map((k) => ({
      key: k.key,
      value: k.value,
    }));

    await this.auditLogService.addAuditLog(
      classInfo,
      req,
      ipAddress,
      'Get Setting Information Successful.',
    );

    return {
      statusCode: HttpStatus.OK,
      data: res,
      message: 'Get Setting Information Successful.',
    };
  }

  @Secure(PermissionEnum.UPDATE_SITE_SETTING, UserRole.ADMIN)
  @Put('update-site-setting')
  @ApiBody({
    type: SettingDto,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Updated Successful',
    type: ResponseVo,
  })
  async updateSiteSetting(
    @Request() req,
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
    @Body() payload: SettingDto,
  ): Promise<ResponseVo<any>> {
    await this.settingService.update(payload);
    await this.auditLogService.addAuditLog(
      classInfo,
      req,
      ipAddress,
      'Update Site Setting Information Successful.',
    );

    return {
      statusCode: HttpStatus.OK,
      data: null,
      message: 'Update Site Setting Information Successful.',
    };
  }
}
