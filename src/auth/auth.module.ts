import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AdminModule } from 'src/admin/admin.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';
import { ConfigModule } from 'src/config/config.module';
import { ConfigService } from 'src/config/config.service';
import { AuditLogModule } from 'src/audit-log/audit-log.module';
import { PermissionModule } from 'src/permission/permission.module';
import { UserModule } from 'src/user/user.module';
import { SharedModule } from 'src/shared/shared.module';
import { CookieStrategy } from './cookie.strategy';

@Module({
  imports: [
    AdminModule,
    UserModule,
    ConfigModule,
    AuditLogModule,
    PermissionModule,
    SharedModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        return {
          secret: configService.get('JWT_SECRET_KEY'),
          ...(configService.get('JWT_EXPIRATION_TIME')
            ? {
                expiresIn: Number(configService.get('JWT_EXPIRATION_TIME')),
              }
            : {}),
        };
      },
    }),
  ],
  providers: [AuthService, JwtStrategy, CookieStrategy],
  controllers: [AuthController],
  exports: [PassportModule.register({ defaultStrategy: 'jwt' })],
})
export class AuthModule {}
