import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';
import { HttpExceptionFilter } from './http-exception.filter';
import { I18nService } from 'nestjs-i18n';

@Catch()
export class UnhandlePromiseRejectionFilter implements ExceptionFilter {
  constructor(private i18n: I18nService) {}

  async catch<T extends Error>(exception: T, host: ArgumentsHost) {
    /*
        use to ignore UnhandledPromiseRejectionWarning: Error [ERR_HTTP_HEADERS_SENT]:
        reference issue https://github.com/nestjs/nest/issues/1061
        */
    if (
      !exception?.message.includes('Unexpected token u in JSON at position 0')
    ) {
      const ctx = host.switchToHttp();
      const response = ctx.getResponse<Response>();
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.removeHeader('Content-Disposition');

      if (exception instanceof HttpException) {
        await new HttpExceptionFilter(this.i18n).catch(exception, host);
      } else {
        response.status(response.statusCode).json({
          message: exception.message,
        });
        return response;
      }
    }
  }
}
