import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Admin } from './entities/admin.entity';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AuditLogModule } from 'src/audit-log/audit-log.module';
import { PermissionModule } from 'src/permission/permission.module';
import { SseModule } from './sse/sse.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Admin]),
    forwardRef(() => AuditLogModule),
    forwardRef(() => PermissionModule),
    SseModule,
  ],
  providers: [AdminService],
  exports: [AdminService],


  controllers: [AdminController],
})
export class AdminModule {}
