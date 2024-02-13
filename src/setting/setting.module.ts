import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogModule } from 'src/audit-log/audit-log.module';
import { PermissionModule } from 'src/permission/permission.module';
import { SharedModule } from 'src/shared/shared.module';
import { Setting } from './entities/setting.entity';
import { SettingController } from './setting.controller';
import { SettingService } from './setting.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Setting]),
    PermissionModule,
    AuditLogModule,
    SharedModule,
  ],
  providers: [SettingService],
  exports: [SettingService],
  controllers: [SettingController],
})
export class SettingModule {}
