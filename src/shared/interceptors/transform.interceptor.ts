import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  statusCode: number;
  message: string;
  data: T;
  total?: number;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, Response<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<Response<T>> | Promise<Observable<Response<T>>> {
    return next.handle().pipe(
      map((result) => {
        const res = JSON.parse(JSON.stringify(result));
        const statusCode = res.statusCode;
        const data = res.data;
        const message = res.message;

        if (res.total != null) {
          return {
            statusCode: statusCode ? statusCode : HttpStatus.OK,
            message: message ? message : '',
            data,
            total: res.total,
          };
        }

        return {
          statusCode: statusCode ? statusCode : HttpStatus.OK,
          message: message ? message : '',
          total: res.total,
          data,
        };
      }),
    );
  }
}
