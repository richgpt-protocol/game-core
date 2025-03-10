import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AdminService } from 'src/admin/admin.service';
import { ConfigService } from 'src/config/config.service';
import { UserRole } from 'src/shared/enum/role.enum';
import { UserService } from 'src/user/user.service';

@Injectable()
export class CookieStrategy extends PassportStrategy(Strategy, 'cookiejwt') {
  constructor(
    readonly configService: ConfigService,
    private adminService: AdminService,
    private userService: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request) => {
          return request?.cookies?.token;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET_KEY'),
    });
  }

  async validate(payload: any) {
    const timeDiff = payload.exp - Date.now();
    if (timeDiff <= 0) {
      throw new UnauthorizedException();
    }

    switch (payload.role) {
      case UserRole.ADMIN:
        const admin = await this.adminService.findById(payload.sub);
        if (!admin) {
          throw new UnauthorizedException();
        }
        if (admin.status != 'A') {
          throw new UnauthorizedException('Admin is not active');
        }
        break;
      case UserRole.USER:
        const user = await this.userService.findOneWithoutHiddenFields(
          payload.sub,
        );
        if (user.status !== 'A') {
          throw new UnauthorizedException('user is not active');
        }
        if (user.isMobileVerified === false) {
          throw new UnauthorizedException('phone number not verified');
        }
        break;
      default:
        throw new UnauthorizedException();
    }

    const result = {
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
      rememberMe: payload.rememberMe,
    };

    if (payload.adminType) {
      result['adminType'] = payload.adminType;
    }

    return result;
  }
}
