import { TelegramService } from './../shared/services/telegram.service';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Put,
  Request,
} from '@nestjs/common';
import { ApiHeader, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { I18n, I18nContext } from 'nestjs-i18n';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { MobileCountries } from 'src/shared/constants/mobile-country.constant';
import { HandlerClass } from 'src/shared/decorators/handler-class.decorator';
import { IpAddress } from 'src/shared/decorators/ip-address.decorator';
import { Secure } from 'src/shared/decorators/secure.decorator';
import { UserRole } from 'src/shared/enum/role.enum';
import { IHandlerClass } from 'src/shared/interfaces/handler-class.interface';
import { SMSService } from 'src/shared/services/sms.service';
import {
  ErrorResponseVo,
  ResponseListVo,
  ResponseVo,
} from 'src/shared/vo/response.vo';
import {
  GetUsersDto,
  RegisterUserDto,
  UpdateUserByAdminDto,
  UpdateUserDto,
} from './dto/register-user.dto';
import { UserService } from './user.service';

@ApiTags('User')
@Controller('api/v1/user')
export class UserController {
  constructor(
    private userService: UserService,
    private auditLogService: AuditLogService,
    private smsService: SMSService,
    private telegramService: TelegramService,
  ) {}

  @Post('sign-up')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Created Successful.',
    type: ResponseVo,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Bad Request',
    type: ErrorResponseVo,
  })
  async signUp(
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
    @Body() payload: RegisterUserDto,
    @I18n() i18n: I18nContext,
  ): Promise<ResponseVo<any>> {
    try {
      const result = await this.userService.register(payload);
      if (result.data) {
        const user = result.data;

        // record into userAuditLog
        await this.auditLogService.userInsert({
          module: classInfo.class,
          actions: classInfo.method,
          userId: user.id.toString(),
          content: 'Registered User Account Successful: ' + JSON.stringify(user),
          ipAddress,
        });

        return {
          statusCode: HttpStatus.OK,
          data: user,
          message: 'otp sent',
        };

      } else {
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          data: {},
          message: await i18n.translate(result.error),
        };
      }

    } catch (ex) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: {},
        message: await i18n.translate(ex.message),
      };
    }
  }

  @Post('sign-in')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Created Successful.',
    type: ResponseVo,
  })
  async signIn(
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
    @Body() payload: { phoneNumber: string },
    @I18n() i18n: I18nContext,
  ): Promise<ResponseVo<any>> {
    try {
      const result = await this.userService.signIn(payload.phoneNumber);
      if (result.data) {
        return {
          statusCode: HttpStatus.OK,
          data: result.data,
          message: 'otp sent',
        };

      } else {
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          data: {},
          message: await i18n.translate(result.error),
        };
      }

    } catch (ex) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: {},
        message: await i18n.translate(ex.message),
      };
    }
  }

  @Secure(null, UserRole.USER)
  @Put('update-profile')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: 200,
    description: 'Updated Successful.',
    type: ResponseVo,
  })
  @ApiResponse({
    status: 400,
    description: 'Failed to update.',
    type: ResponseVo,
  })
  async updateProfile(
    @Request() req,
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
    @Body() payload: UpdateUserDto,
    @I18n() i18n: I18nContext,
  ) {
    const result = await this.userService.update(req.user.userId, {
      phoneNumber: payload.phoneNumber,
      firstName: payload.name,
      backupEmailAddress: payload.backupEmailAddress,
      nric: payload.nric,
    });

    if (result.affected > 0) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      await this.auditLogService.userInsert({
        module: classInfo.class,
        actions: classInfo.method,
        userId: req.user.userId.toString(),
        content: 'Update User Profile Successful: ' + JSON.stringify(payload),
        ipAddress,
      });

      const user = await this.userService.getUserInfo(req.user.userId);
      return {
        statusCode: 200,
        data: user,
        message: await i18n.translate('user.PROFILE_UPDATE_SUCCESSFUL'),
      };
    } else {
      return {
        statusCode: 400,
        data: {},
        message: await i18n.translate('user.PROFILE_UPDATE_FAILED'),
      };
    }
  }

  @Secure(null, UserRole.USER)
  @Get('get-profile')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: 200,
    description: 'Successful Response',
    type: ResponseVo,
  })
  async getProfile(
    @Request() req,
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
    @I18n() i18n: I18nContext,
  ) {
    const user = await this.userService.getUserInfo(req.user.userId);
    if (user) {
      await this.auditLogService.addAuditLog(
        classInfo,
        req,
        ipAddress,
        `Get User Info Successful`,
      );

      return {
        statusCode: 200,
        data: user,
        message: null,
      };
    } else {
      await this.auditLogService.addAuditLog(
        classInfo,
        req,
        ipAddress,
        `Get User Info Failed`,
      );

      return {
        success: 400,
        data: {},
        message: await i18n.translate('user.FAILED_GET_PROFILE'),
      };
    }
  }

  @Secure(null, UserRole.USER)
  @Get('get-registration-form')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: 200,
    description: 'Successful Response',
    type: ResponseVo,
  })
  async getRegistrationForm(
    @Request() req,
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
    @I18n() i18n: I18nContext,
  ): Promise<ResponseVo<any>> {
    const mobileCountries = async () => {
      return Promise.all(
        MobileCountries.map(async (m) => {
          const name = await i18n.translate(m.i18n);
          return {
            code: m.code,
            phoneCode: m.phoneCode,
            name,
          };
        }),
      );
    };

    const user = await this.userService.findOneWithoutHiddenFields(
      req.user.userId,
    );
    if (!user) {
      throw new BadRequestException('User is not found.');
    }

    await this.auditLogService.addAuditLog(
      classInfo,
      req,
      ipAddress,
      'Get Registration Form Successful.',
    );

    return {
      statusCode: HttpStatus.OK,
      data: {
        mobileCountries: await mobileCountries(),
        userDetails: user,
      },
      message: 'Get Registration Form Successful.',
    };
  }

  @Secure(null, UserRole.ADMIN)
  @Post('get-users')
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Retrieved Successful',
    type: ResponseListVo,
  })
  async getUsers(
    @Request() req,
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
    @Body() payload: GetUsersDto,
  ): Promise<ResponseListVo<any>> {
    const [result, total] = await this.userService.getUsers(payload);

    await this.auditLogService.addAuditLog(
      classInfo,
      req,
      ipAddress,
      'Retrieved user listing successful: ' + JSON.stringify(payload),
    );

    return {
      statusCode: HttpStatus.OK,
      data: result,
      message: 'Retrieved user listing successful.',
      total,
    };
  }

  @Secure(null, UserRole.ADMIN)
  @Get('find-user/:id')
  @ApiResponse({
    status: 200,
    description: 'Successful Response',
    type: ResponseVo,
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'User ID',
  })
  async findUser(
    @Request() req,
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
    @Param() params,
  ): Promise<ResponseVo<any>> {
    const result = await this.userService.findOneWithoutHiddenFields(
      Number(params.id),
    );

    await this.auditLogService.addAuditLog(
      classInfo,
      req,
      ipAddress,
      'Retrieved User successfully: ' + params.id,
    );

    return {
      statusCode: HttpStatus.OK,
      data: result,
      message: 'Retrieved User successfully.',
    };
  }

  @Secure(null, UserRole.ADMIN)
  @Put('update-profile-by-admin/:id')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: 200,
    description: 'Updated Successful.',
    type: ResponseVo,
  })
  @ApiResponse({
    status: 400,
    description: 'Failed to update.',
    type: ResponseVo,
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'User ID',
  })
  async updateProfileByAdmin(
    @Request() req,
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
    @Body() payload: UpdateUserByAdminDto,
    @I18n() i18n: I18nContext,
    @Param() params,
  ) {
    const result = await this.userService.update(Number(params.id), payload);
    await this.auditLogService.addAuditLog(
      classInfo,
      req,
      ipAddress,
      `Update User Profile - ${params.id}: ${JSON.stringify(payload)}`,
    );

    if (result.affected > 0) {
      const user = await this.userService.getUserInfo(Number(params.id));
      return {
        statusCode: 200,
        data: user,
        message: await i18n.translate('Update user profile successfully.'),
      };
    } else {
      return {
        statusCode: 400,
        data: {},
        message: await i18n.translate('Failed to update user profile.'),
      };
    }
  }

  // TODO, this endpoint get all user info after login that required by frontend at once
  @Secure(null, UserRole.USER)
  @Post('get-all-user-info')
  async getAllUserInfo() {
    // user - phoneNumber
    // user - referralCode
    // wallet - walletAddress
    // wallet - balance
    // wallet - redeemable
    // wallet - xp
    // credit - all available credit amount
    // game - current epoch
    // bet - all numbers(forecast & amount) for current epoch
  }
}
