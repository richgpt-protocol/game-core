import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminService } from 'src/admin/admin.service';
import { ConfigService } from 'src/config/config.service';
import { LoginDto, UserLoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { AdminStatus, UserStatus } from 'src/shared/enum/status.enum';
import { UserService } from 'src/user/user.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UserRole } from 'src/shared/enum/role.enum';
import { RandomUtil } from 'src/shared/utils/random.util';
import { CacheSettingService } from 'src/shared/services/cache-setting.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class AuthService {
  constructor(
    private adminService: AdminService,
    private jwtService: JwtService,
    private readonly configService: ConfigService,
    private userService: UserService,
    private cacheSettingService: CacheSettingService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
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
    const result = await this.userService.verifyOtp(payload);
    if (result.error) {
      return { error: result.error, data: null };
    }

    return result.data;
  }

  async verifyOtt(uid: string, ott: string) {
    const user = await this.userService.findByCriteria('uid', uid);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const ottData = await this.cacheManager.get(`ott_${user.uid}`);

    const hashOTT = (ott: string) => {
      return crypto.createHash('sha256').update(ott).digest('hex'); // Hash the OTT and return as a hex string
    };

    if (ottData) {
      if (hashOTT(ottData as string) === ott) {
        this.cacheManager.del(`ott_${user.uid}`);
        return user;
      }
    }

    throw new BadRequestException('Invalid OTT');
  }

  async requestGameToken(userId: number) {
    try {
      const user = await this.userService.findOne(userId);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      const secretKey = this.configService.get('FUYO_GAME_SECRET_KEY');
      const hmacKey = this.configService.get('FUYO_GAME_HMAC_KEY');
      const iv = crypto.randomBytes(16);

      const timestamp = Date.now();
      const message = `${user.uid}:${timestamp}`;

      // Encryption
      const cipher = crypto.createCipheriv('aes-256-cbc', secretKey, iv);
      let encrypted = cipher.update(message, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // HMAC for Integrity
      const hash = crypto
        .createHmac('sha256', hmacKey)
        .update(encrypted)
        .digest('hex');

      // Concatenate iv, encrypted, and hash
      const token = `${iv.toString('hex')}:${encrypted}:${hash}`;

      // Encode for URL
      return encodeURIComponent(token); // URL encode to pass safely
    } catch (error) {
      console.log('error', error);
      throw error;
    }
  }

  async createToken(user: any, role: string) {
    const payload = {
      sub: user.id,
      role,
      exp:
        new Date().getTime() +
        Number(this.configService.get('JWT_EXPIRATION_TIME')) * 1000,
    };

    if (user.adminType) {
      Object.assign(payload, { adminType: user.adminType });
    }
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
        if (!(await this.verifyPassword(payload.currentPassword, null))) {
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
