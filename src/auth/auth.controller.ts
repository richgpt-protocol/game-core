import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Request,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiHeader, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminService } from 'src/admin/admin.service';
import { CreateAdminVo } from 'src/admin/vo/admin.vo';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { HandlerClass } from 'src/shared/decorators/handler-class.decorator';
import { IpAddress } from 'src/shared/decorators/ip-address.decorator';
import { Secure, SecureEJS } from 'src/shared/decorators/secure.decorator';
import { UserRole } from 'src/shared/enum/role.enum';
import { IHandlerClass } from 'src/shared/interfaces/handler-class.interface';
import { ErrorResponseVo, ResponseVo } from 'src/shared/vo/response.vo';
import { UserService } from 'src/user/user.service';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto, UserLoginDto } from './dto/login.dto';
import { ResponseAdminAuthVo } from './vo/auth.vo';
import {
  PasswordResetDto,
  ResetPasswordDto,
  UserResetPasswordDto,
} from './dto/reset-password.dto';
import { PermissionEnum } from 'src/shared/enum/permission.enum';
import { I18n, I18nContext } from 'nestjs-i18n';
import { EnumUtil } from 'src/shared/utils/enum.util';

@ApiTags('Authentication')
@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private auditLogService: AuditLogService,
    private adminService: AdminService,
    private userService: UserService,
  ) {}

  @Post('admin-login')
  @ApiResponse({
    status: 201,
    description: 'Successful Login',
    type: ResponseAdminAuthVo,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request',
    type: ErrorResponseVo,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    type: ErrorResponseVo,
  })
  async adminLogin(
    @Body() payload: LoginDto,
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
    @Res({ passthrough: true }) res: Response,
  ) {
    const admin = await this.authService.validateAdmin(payload);
    if (admin.error) {
      await this.auditLogService.adminInsert({
        module: classInfo.class,
        actions: classInfo.method,
        userId: '',
        content: `Login Failed - ${admin.error} `,
        ipAddress,
      });
      throw new UnauthorizedException(admin.error);
    } else {
      await this.auditLogService.adminInsert({
        module: classInfo.class,
        actions: classInfo.method,
        userId: admin.id,
        content: `Login Successful with ${admin.username} `,
        ipAddress,
      });
      const response: CreateAdminVo = {
        id: admin.id,
        username: admin.username,
        emailAddress: admin.emailAddress,
        adminType: admin.adminType,
        lastLogin: admin.lastLogin,
        status: admin.status,
      };

      const result = await this.authService.createToken(
        response,
        UserRole.ADMIN,
      );

      const responseData: ResponseAdminAuthVo = {
        statusCode: HttpStatus.OK,
        message: 'Admin Login Successful.',
        data: result,
      };

      const expires: Date = new Date(new Date().getTime() + result.expiresIn);
      res.cookie('token', result.access_token, {
        httpOnly: true,
        expires,
        sameSite: 'strict',
      });

      return responseData;
    }
  }

  @Post('admin-logout')
  @ApiResponse({
    status: 201,
    description: 'Successful Logout',
    type: ResponseVo,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request',
    type: ErrorResponseVo,
  })
  async adminLogout(
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
    @Request() req,
    @Res({ passthrough: true }) res: Response,
  ) {
    //need to be cleared through the api as its a http-only cookie.
    res.clearCookie('token');
    return {
      statusCode: HttpStatus.OK,
      success: true,
      data: {},
    };
  }

  @Post('user-login')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: 201,
    description: 'Successful Login',
    type: ResponseVo,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request',
    type: ErrorResponseVo,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    type: ErrorResponseVo,
  })
  async userLogin(
    @Body() payload: UserLoginDto,
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
    @I18n() i18n: I18nContext,
  ) {
    const user = await this.authService.loginAsUser(payload);
    if (user.error) {
      let message = '';
      if (user.args) {
        message = await i18n.translate(user.error, {
          args: user.args,
        });
      } else {
        message = await i18n.translate(user.error);
      }

      await this.auditLogService.userInsert({
        module: classInfo.class,
        actions: classInfo.method,
        userId: '',
        content: `Login Failed - ${message} `,
        ipAddress,
      });
      throw new UnauthorizedException(message);
    } else {
      await this.auditLogService.userInsert({
        module: classInfo.class,
        actions: classInfo.method,
        userId: user.id,
        content: `Login Successful with ${user.phoneNumber} `,
        ipAddress,
      });

      const response = {
        id: user.id,
        status: user.status,
        phoneNumber: user.phoneNumber,
        referralCode: user.referralCode,
        isMobileVerified: user.isMobileVerified,
      };

      const result = await this.authService.createToken(
        response,
        UserRole.USER,
      );

      return {
        success: true,
        data: result,
      };
    }
  }

  @Secure()
  @Post('change-password')
  @ApiResponse({
    status: 201,
    description: 'Successful Updated',
    type: ResponseVo,
  })
  async changePassword(
    @Body() payload: ChangePasswordDto,
    @Request() req,
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
  ) {
    let userInfo = {};
    switch (req.user.role) {
      case UserRole.ADMIN:
        userInfo = await this.adminService.findById(req.user.userId);
        break;
      case UserRole.USER:
        userInfo = await this.userService.findOne(req.user.userId);
        break;
      // TODO Add for new roles
      default:
        throw new BadRequestException('Invalid User.');
    }

    if (!userInfo) {
      throw new BadRequestException('Invalid User.');
    }

    const result = await this.authService.changePassword(
      payload,
      req.user.role,
      req.user.userId,
    );

    if (result) {
      await this.auditLogService.addAuditLog(
        classInfo,
        req,
        ipAddress,
        `Changed Password Succesful - ${req.user.userId}`,
      );

      return {
        success: true,
        data: {},
      };
    } else {
      return {
        success: false,
        data: {},
      };
    }
  }

  @Secure()
  @Get('getLoggedInUser')
  @ApiResponse({
    status: 200,
    description: 'Successful Response',
    type: ResponseVo,
  })
  async getLoggedInUser(@Request() req): Promise<ResponseVo<any>> {
    return {
      statusCode: HttpStatus.OK,
      message: '',
      data: req.user,
    };
  }

  @Secure()
  @Get('refresh-token')
  @ApiResponse({
    status: 200,
    description: 'Successful Response',
    type: ResponseVo,
  })
  async refreshToken(@Request() req) {
    let response = null;
    switch (req.user.role) {
      case UserRole.ADMIN:
        const admin = await this.adminService.findById(req.user.userId);
        if (admin) {
          response = {
            id: admin.id,
            username: admin.username,
            emailAddress: admin.emailAddress,
            adminType: admin.adminType,
            lastLogin: admin.lastLogin,
            status: admin.status,
          };
        }
        break;
      case UserRole.USER:
        const user = await this.userService.findOne(req.user.userId);
        if (user) {
          response = {
            id: user.id,
            status: user.status,
            phoneNumber: user.phoneNumber,
            isReset: user.isReset,
          };
        }
        break;
      // TODO Add new roles
    }

    if (response == null) {
      throw new UnauthorizedException();
    }

    const result = await this.authService.createToken(response, req.user.role);

    return {
      success: true,
      data: result,
    };
  }

  @Post(':role/forgot-password')
  @ApiResponse({
    status: 201,
    description: 'Successful Updated',
    type: ResponseVo,
  })
  @ApiParam({
    name: 'role',
    type: String,
    description: `'admin'`,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request',
    type: ErrorResponseVo,
  })
  async forgotPassword(@Body() payload: ResetPasswordDto, @Param() params) {
    let userInfo;
    let roleName = '';
    switch (params.role) {
      case 'admin':
        userInfo = await this.adminService.findByEmailAndUsername(
          payload.emailAddress,
          payload.username,
        );
        roleName = UserRole.ADMIN;
        break;
      default:
        throw new BadRequestException('Invalid User.');
    }

    if (!userInfo) {
      throw new BadRequestException(
        'Invalid username/email address. Please try again.',
      );
    }

    const result = await this.authService.resetPassword(roleName, userInfo.id);

    if (result) {
      return {
        success: true,
        data: {},
      };
    } else {
      return {
        success: false,
        data: {},
      };
    }
  }

  @Post('reset-password')
  @Secure(PermissionEnum.RESET_ADMIN_PASSWORD, UserRole.ADMIN)
  @ApiResponse({
    status: 201,
    description: 'Successful Updated',
    type: ResponseVo,
  })
  async resetPassword(
    @Body() payload: PasswordResetDto,
    @Request() req,
    @IpAddress() ipAddress,
    @HandlerClass() classInfo: IHandlerClass,
  ) {
    try {
      if (!EnumUtil.checkExistEnum(payload.userRole, UserRole)) {
        throw new BadRequestException('Invalid User Role!');
      }

      const result = await this.authService.resetPassword(
        payload.userRole,
        payload.id,
        true,
      );

      if (result) {
        await this.auditLogService.addAuditLog(
          classInfo,
          req,
          ipAddress,
          `Reset Password Successful by ${req.user.username} - ${JSON.stringify(
            payload,
          )}`,
        );

        return {
          success: true,
          data: {},
        };
      } else {
        await this.auditLogService.addAuditLog(
          classInfo,
          req,
          ipAddress,
          `Reset Password Failed by ${req.user.username} - ${JSON.stringify(
            payload,
          )}`,
        );

        return {
          success: false,
          data: {},
        };
      }
    } catch (err) {
      await this.auditLogService.addAuditLog(
        classInfo,
        req,
        ipAddress,
        `Reset Password is failed by ${req.user.username} - ${JSON.stringify(
          payload,
        )} due to ${err.message}`,
      );

      return {
        success: false,
        data: {
          message: err,
        },
      };
    }
  }

  // @Post('user-forgot-password')
  // @ApiResponse({
  //   status: 201,
  //   description: 'Successful Updated',
  //   type: ResponseVo,
  // })
  // @ApiResponse({
  //   status: 400,
  //   description: 'Bad Request',
  //   type: ErrorResponseVo,
  // })
  // async userForgotPassword(@Body() payload: UserResetPasswordDto) {
  //   const userInfo = await this.userService.findByEmail(payload.emailAddress);
  //   if (!userInfo) {
  //     throw new BadRequestException('Invalid User.');
  //   }

  //   const result = await this.authService.resetPassword(
  //     UserRole.USER,
  //     userInfo.id,
  //   );

  //   if (result) {
  //     return {
  //       success: true,
  //       data: {},
  //     };
  //   } else {
  //     return {
  //       success: false,
  //       data: {},
  //     };
  //   }
  // }
}
