import { BadRequestException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminService } from 'src/admin/admin.service';
import { ConfigService } from 'src/config/config.service';
import { LoginDto, UserLoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { AdminStatus, UserStatus } from 'src/shared/enum/status.enum';
import { UserService } from 'src/user/user.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UserRole } from 'src/shared/enum/role.enum';
import { RandomUtil } from 'src/shared/utils/random.util';
import { SettingEnum } from 'src/shared/enum/setting.enum';
import { CacheSettingService } from 'src/shared/services/cache-setting.service';

@Injectable()
export class AuthService {
  constructor(
    private adminService: AdminService,
    private jwtService: JwtService,
    private readonly configService: ConfigService,
    private userService: UserService,
    private cacheSettingService: CacheSettingService,
  ) {}

  async validateAdmin(payload: LoginDto): Promise<any> {
    let admin = await this.adminService.findOne(payload.username);
    if (!admin) {
      return {
        error: 'Wrong username or password.',
      };
    }

    switch (admin.status) {
      case AdminStatus.INACTIVE:
        return {
          error: 'This account is inactive.',
        };
      case AdminStatus.SUSPENDED:
        return {
          error: 'This account is suspended.',
        };
    }

    // if (admin.loginAttempt >= 3) {
    //   await this.adminService.update(admin.id, {
    //     status: AdminStatus.SUSPENDED,
    //   });
    //   return {
    //     error:
    //       'Login Attempt is exceeded than 3 times. Please send email to System Administrator to take actions. ',
    //   };
    // }

    const { password, ...result } = admin;
    if (await this.verifyPassword(payload.password, password)) {
      // Clear Login Attempt
      const r = await this.adminService.update(admin.id, {
        loginAttempt: 0,
        lastLogin: new Date(),
      });

      if (r) {
        admin = await this.adminService.findById(admin.id);
        return {
          ...result,
          lastLogin: admin.lastLogin,
        };
      }

      return {
        error: 'Failed to login.',
      };
    } else {
      // Increase failed login attempt
      await this.adminService.update(admin.id, {
        loginAttempt: admin.loginAttempt + 1,
      });
      return {
        error: 'Wrong username or password.',
      };
    }
  }

  async loginAsUser(payload: UserLoginDto): Promise<any> {
    // const user = await this.userService.findByEmail(payload.emailAddress);
    const user = await this.userService.findByPhoneNumber(payload.phoneNumber);

    if (!user) {
      return {
        // error: 'user.WRONG_EMAIL_PASSWORD',
        error: 'user.WRONG_PHONE_NUMBER',
      };
    }

    switch (user.status) {
      case UserStatus.INACTIVE:
        return {
          error: 'user.ACCOUNT_INACTIVE',
        };
      case UserStatus.SUSPENDED:
        return {
          error: 'user.ACCOUNT_SUSPEND',
          args: {
            id: 1,
            supportEmail: this.cacheSettingService.get(
              SettingEnum.SUPPORT_CONTACT_EMAIL,
            ),
          },
        };
      case UserStatus.TERMINATED:
        return {
          error: 'user.ACCOUNT_TERMINATED',
        };
      case UserStatus.UNVERIFIED:
        return {
          error: 'user.ACCOUNT_UNVERIFIED',
        };
    }

    if (user.loginAttempt >= 3) {
      await this.userService.update(user.id, {
        status: UserStatus.SUSPENDED,
      });
      return {
        error: 'user.EXCEED_LOGIN_ATTEMPT',
      };
    }

    const { password, ...result } = user;
    // if (await this.verifyPassword(payload.password, password)) {
    //   // Clear Login Attempt
    //   await this.userService.update(user.id, {
    //     loginAttempt: 0,
    //   });

      return result;
    // } else {
    //   // Increase failed login attempt
    //   await this.userService.update(user.id, {
    //     loginAttempt: user.loginAttempt + 1,
    //   });
    //   return {
    //     error: 'user.WRONG_EMAIL_PASSWORD',
    //   };
    // }
  }

  async createToken(user: any, role: string) {
    const username = user.username ? user.username : user.emailAddress;
    const payload = {
      username,
      sub: user.id,
      role,
      exp:
        new Date().getTime() +
        Number(this.configService.get('JWT_EXPIRATION_TIME')) * 1000,
    };
    return {
      expiresIn: Number(this.configService.get('JWT_EXPIRATION_TIME')) * 1000,
      access_token: this.jwtService.sign(payload),
      user,
    };
  }

  async changePassword(payload: ChangePasswordDto, role: string, id: number) {
    if (role == null) {
      throw new BadRequestException('Invalid User');
    }

    switch (role) {
      case UserRole.ADMIN:
        const admin = await this.adminService.findById(id);
        if (
          !(await this.verifyPassword(payload.currentPassword, admin.password))
        ) {
          throw new BadRequestException('Current Password is not matched.');
        }
        return await this.adminService.update(id, {
          password: await this.generateHashedPassword(payload.newPassword),
          // password: payload.newPassword,
        });
      case UserRole.USER:
        const user = await this.userService.findOne(id);
        if (
          !(await this.verifyPassword(payload.currentPassword, user.password))
        ) {
          throw new BadRequestException('Current Password is not matched.');
        }
        return await this.userService.update(id, {
          password: await this.generateHashedPassword(payload.newPassword),
          // password: payload.newPassword,
          isReset: user.isReset ? false : user.isReset,
        });
      // TODO Add new roles
    }
  }

  async resetPassword(role: string, id: number, reset?: boolean) {
    if (role == null) {
      throw new BadRequestException('Invalid User');
    }

    const password =
      RandomUtil.generateRandomLowerCase(1) +
      RandomUtil.generateRandomCode(2) +
      RandomUtil.generateRandomUpperCase(1) +
      RandomUtil.generateRandomNumber(1) +
      RandomUtil.generateRandomSymbol(1) +
      RandomUtil.generateRandomCode(2);
    let result = null;

    if (this.configService.get('APP_ENV') === 'dev') {
      console.log('password', password);
    }

    switch (role) {
      case UserRole.ADMIN:
        const admin = await this.adminService.findById(id);
        if (!admin) {
          throw new BadRequestException('Invalid User');
        }
        if (reset) {
          result = await this.adminService.update(id, {
            password: await this.generateHashedPassword(password),
            // firstTimeLogin: true,
            status: UserStatus.ACTIVE,
            loginAttempt: 0,
          });
        } else {
          result = await this.adminService.update(id, {
            password: await this.generateHashedPassword(password),
            // firstTimeLogin: true,
          });
        }

        if (result) {
          // await this.emailService.sendResetPasswordEmail(
          //   admin.emailAddress,
          //   password,
          //   admin.username,
          // );

          return true;
        }
        return false;
      case UserRole.USER:
        const user = await this.userService.findOne(id);
        if (!user) {
          throw new BadRequestException('Invalid User.');
        }
        if (reset) {
          result = await this.userService.update(id, {
            password: await this.generateHashedPassword(password),
            isReset: true,
            status: UserStatus.ACTIVE,
            loginAttempt: 0,
          });
        } else {
          result = await this.userService.update(id, {
            password: await this.generateHashedPassword(password),
            isReset: true,
          });
        }

        if (result && result.affected > 0) {
          // await this.emailService.sendResetPasswordEmail(
          //   user.emailAddress,
          //   password,
          //   user.firstName,
          // );

          return true;
        }

        return false;
      // TODO Add new roles
    }
  }

  async generateHashedPassword(password: string) {
    const hashed = await bcrypt.hash(password, 10);
    return hashed;
  }

  async verifyPassword(plainTextPassword: string, hashedPassword: string) {
    // const isMatched = plainTextPassword === hashedPassword; // Frontend do encryption
    const isMatched = await bcrypt.compare(plainTextPassword, hashedPassword);
    return isMatched;
  }
}
