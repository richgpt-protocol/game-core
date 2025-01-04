// import { TelegramService } from './../shared/services/telegram.service';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpStatus,
  Inject,
  Logger,
  Param,
  Post,
  Put,
  Query,
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
// import { SMSService } from 'src/shared/services/sms.service';
import {
  ErrorResponseVo,
  ResponseListVo,
  ResponseVo,
} from 'src/shared/vo/response.vo';
import {
  GetUsersDto,
  RegisterUserDto,
  SignInDto,
  UpdateUserByAdminDto,
  UpdateUserDto,
  VerifyOtpDto,
  WithdrawlPinByAdminDto,
  WithdrawlPinDto,
} from './dto/register-user.dto';
import { UserService } from './user.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { WalletService } from 'src/wallet/wallet.service';
import { DataSource } from 'typeorm';
import { isValidSixDigitPairs } from 'src/shared/utils/digit-validation.util';

@ApiTags('User')
@Controller('api/v1/user')
export class UserController {
  private logger = new Logger(UserController.name);

  constructor(
    private userService: UserService,
    private walletService: WalletService,
    private auditLogService: AuditLogService,
    // private smsService: SMSService,
    // private telegramService: TelegramService,
    private eventEmitter: EventEmitter2,
    private dataSource: DataSource,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
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
          content:
            'Registered User Account Successful: ' + JSON.stringify(user),
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
    @Body() payload: SignInDto,
    @I18n() i18n: I18nContext,
  ): Promise<ResponseVo<any>> {
    try {
      const result = await this.userService.signIn(payload);
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
  @Post('update-profile')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  async updateProfile(
    @Request() req,
    @Body() payload: UpdateUserDto,
    // @IpAddress() ipAddress,
    // @HandlerClass() classInfo: IHandlerClass,
    // @I18n() i18n: I18nContext,
  ) {
    const userId = req.user.userId;
    const phoneNumber = payload.phoneNumber ?? null;
    const backupEmailAddress = payload.backupEmailAddress ?? null;
    if (!phoneNumber && !backupEmailAddress) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: {},
        message: 'Please provide either phoneNumber or backupEmailAddress',
      };
    }

    if (await this.userService.isOtpGeneratedWithin60Seconds(null, userId)) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: {},
        message: 'otp generated within 60 seconds',
      };
    }

    // update otp method into database
    await this.userService.updateOtpMethod(userId, payload.otpMethod);

    // save payload into cache to use in verifyOtp()
    // the cache is valid for 60 seconds(60000 milliseconds), which is same expired time as the otp
    await this.cacheManager.set(`${userId} phoneNumber`, phoneNumber, 60000);
    await this.cacheManager.set(
      `${userId} backupEmailAddress`,
      backupEmailAddress,
      60000,
    );

    // pass to handleGenerateOtpEvent() to generate and send otp
    this.eventEmitter.emit('user.service.otp', { userId, phoneNumber });

    return {
      statusCode: HttpStatus.OK,
      data: {},
      message: 'otp sent',
    };
  }

  @Secure(null, UserRole.ADMIN)
  @Post('terminate-user/:id')
  async terminateUser(
    @Request() req,
    @Param() params,
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
  ) {
    try {
      const result = await this.userService.terminateUser(Number(params.id));
      if (!result.error) {
        return {
          statusCode: HttpStatus.OK,
          data: {},
          message: 'Terminate user successful',
        };
      } else {
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          data: {},
          message: result.error,
        };
      }
    } catch (error) {
      console.log(error);
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        data: {},
        message: 'Failed to terminate user',
      };
    }
  }

  // this /verify-otp can be used only if the user is logged in(with access token)
  @Secure(null, UserRole.USER)
  @Post('verify-otp')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  async verifyOtp(
    @Request() req,
    @Body() payload: VerifyOtpDto,
    // @IpAddress() ipAddress,
    // @HandlerClass() classInfo: IHandlerClass,
    // @I18n() i18n: I18nContext,
  ) {
    try {
      const userId = req.user.userId;

      const user = await this.userService.getUserInfo(userId);
      const res = await this.userService.verifyOtp({
        phoneNumber: user.phoneNumber,
        code: payload.otp,
      });
      if (res.error) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: {},
          message: res.error,
        };
      }

      // fetch payload from cache & update user profile
      const phoneNumber = await this.cacheManager.get(`${userId} phoneNumber`);
      const backupEmailAddress = await this.cacheManager.get(
        `${userId} backupEmailAddress`,
      );
      await this.userService.update(userId, {
        phoneNumber: phoneNumber ?? user.phoneNumber,
        emailAddress: backupEmailAddress ?? user.emailAddress,
      });

      return {
        statusCode: HttpStatus.CREATED,
        data: {},
        message: 'update profile successful',
      };
    } catch (error) {
      this.logger.error(error);
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        data: {},
        message: 'Failed to update profile, please contact admin',
      };
    }
  }

  @Secure(null, UserRole.USER)
  @Post('update-withdraw-password')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  async updateWithdrawPassword(
    @Request() req,
    @Body() payload: WithdrawlPinDto,
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
  ) {
    if (!isValidSixDigitPairs(payload.pin)) {
      throw new BadRequestException('Invalid withdraw pin format');
    }

    await this.userService.updateWithdrawPin(
      req.user.userId,
      payload.pin,
      payload.oldPin,
    );

    await this.auditLogService.addAuditLog(
      classInfo,
      req,
      ipAddress,
      `Update Withdraw Password Successful.`,
    );

    return {
      statusCode: HttpStatus.CREATED,
      data: {},
      message: 'Update withdraw password successful',
    };
  }

  @Secure(null, UserRole.ADMIN)
  @Post('update-withdraw-password-by-admin')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  async updateWithdrawPasswordByAdmin(
    @Request() req,
    @Body() payload: WithdrawlPinByAdminDto,
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
  ) {
    if (!isValidSixDigitPairs(payload.pin)) {
      throw new BadRequestException('Invalid withdraw pin format');
    }

    await this.userService.updateWithdrawPin(
      payload.userId,
      payload.pin,
      payload.oldPin,
    );

    await this.auditLogService.addAuditLog(
      classInfo,
      req,
      ipAddress,
      `Update Withdraw Password Successful. UserId: ${payload.userId}`,
    );

    return {
      statusCode: HttpStatus.CREATED,
      data: {},
      message: 'Update withdraw password successful',
    };
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
    const user = (await this.userService.getUserInfo(req.user.userId)) as any;
    if (user) {
      await this.auditLogService.addAuditLog(
        classInfo,
        req,
        ipAddress,
        `Get User Info Successful`,
      );

      const levelAndPercentage = this.walletService.calculateLevelAndPercentage(
        Number(user.wallet.pointBalance),
      );
      user.wallet.level = levelAndPercentage.level;
      user.wallet.levelPercentage = levelAndPercentage.percentage;

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
  @Get('get-notification')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: 200,
    description: 'Successful Response',
    type: ResponseVo,
  })
  async getUserNotification(
    @Request() req,
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
    @I18n() i18n: I18nContext,
  ) {
    const notification = await this.userService.getUserNotification(
      req.user.userId,
    );

    return {
      statusCode: 200,
      data: notification,
      message: null,
    };
  }

  @Secure(null, UserRole.USER)
  @Put('update-notification')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: 200,
    description: 'Successful Response',
    type: ResponseVo,
  })
  async updateUserNotification(
    @Request() req,
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
    @I18n() i18n: I18nContext,
  ) {
    const notification = await this.userService.updateUserNotification(
      req.user.userId,
    );

    return {
      statusCode: 200,
      data: notification,
      message: null,
    };
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

  @Secure(null, UserRole.USER)
  @Get('get-referee-performance')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: 200,
    description: 'Successful Response',
    type: ResponseVo,
  })
  async getRefereePerformance(
    @Request() req,
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
    @I18n() i18n: I18nContext,
    @Query('count') count: number,
  ) {
    try {
      const phoneNumberAndRewardAmount =
        await this.userService.getRefereePerformance(req.user.userId, count);
      return {
        statusCode: 200,
        data: phoneNumberAndRewardAmount,
        message: null,
      };
    } catch (error) {
      return {
        statusCode: 400,
        data: null,
        message: await i18n.translate('Failed to get referee performance.'),
      };
    }
  }

  @Get('get-referrer')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: 200,
    description: 'Successful Response',
    type: ResponseVo,
  })
  async getReferrer(
    // @Request() req,
    // @IpAddress() ipAddress,
    // @HandlerClass() classInfo: IHandlerClass,
    @I18n() i18n: I18nContext,
    @Query('code') code: string,
  ) {
    try {
      if (!code) throw new Error();
      const referrer = await this.userService.getReferrer(code);
      return {
        statusCode: 200,
        data: referrer,
        message: null,
      };
    } catch (error) {
      return {
        statusCode: 400,
        data: null,
        message: await i18n.translate('Referrer not exist.'),
      };
    }
  }
}
