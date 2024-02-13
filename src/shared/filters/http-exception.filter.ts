import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { I18nService } from 'nestjs-i18n';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private i18n: I18nService) {}

  async catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const lang = ctx.getRequest().i18nLang;
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = [];

    try {
      if (exception instanceof HttpException) {
        status = exception.getStatus();
        if (exception.getResponse() instanceof Object) {
          const msg = JSON.parse(
            JSON.stringify(exception.getResponse()),
          ).message;

          if (typeof msg === 'string') {
            message.push(
              await this.i18n.translate(msg, {
                lang,
              }),
            );
          } else {
            const translateMessages = async () => {
              return Promise.all(
                msg.map(async (m) => {
                  if (typeof m === 'object') {
                    const messageTag = JSON.parse(JSON.stringify(m));
                    return await this.i18n.translate(messageTag.key, {
                      lang,
                      args: messageTag.args,
                    });
                  } else {
                    return await this.i18n.translate(m, {
                      lang,
                    });
                  }
                }),
              );
            };
            message = await translateMessages();
          }
        }
      } else {
        this.logger.error(exception);
      }

      response.status(status).json({
        statusCode: status,
        message,
      });
    } catch (err) {
      response.status(status).json({
        statusCode: status,
        message: err.message,
      });
    }
  }
}
