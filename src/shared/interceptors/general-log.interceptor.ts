import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AdminAuditLog } from 'src/audit-log/entities/admin-audit-log.entity';
import { GeneralLog } from 'src/audit-log/entities/general-log.entity';
import { UserAuditLog } from 'src/audit-log/entities/user-audit-log.entity';
import { Repository } from 'typeorm';

@Injectable()
export class GeneralLogInterceptor implements NestInterceptor {

  constructor(
    @InjectRepository(GeneralLog)
    private GeneralLogRepository: Repository<GeneralLog>,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    if (request.method == 'GET') return next.handle();

    const generalLog = await this.GeneralLogRepository.save(
      this.GeneralLogRepository.create({
        userId: request.user ? request.user.userId : null,
        username: request.user ? request.user.username : null,
        userRole: request.user ? request.user.role : null,
        reqQuery: JSON.stringify(request.query),
        reqBody: JSON.stringify(request.body),
        reqParams: JSON.stringify(request.params),
        reqMethod: request.method,
        reqUrl: request.url,
        ipAddress: request.ip,
      }),
    );

    const now = Date.now();
    return next
      .handle()
      .pipe(
        tap(async (result) => {
          await this.GeneralLogRepository.update(
            { id: generalLog.id },
            {
              resStatusCode: result.statusCode,
              resMessage: result.message,
              resData: JSON.stringify(result.data),
            },
          );
        }),
      );
  }
}
