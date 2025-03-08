import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { setupSwagger } from './swagger';
import { Logger, ValidationPipe } from '@nestjs/common';
import { TransformInterceptor } from './shared/interceptors/transform.interceptor';
import { sseMiddleware } from 'express-sse-middleware';
import * as bodyParser from 'body-parser';
import * as cookieParser from 'cookie-parser';
import { join } from 'path';
import { ConfigService } from './config/config.service';
import { QueueService } from './queue/queue.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  setupSwagger(app);
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Filtered not defined on DTOs variables
    }),
  );
  app.useGlobalInterceptors(new TransformInterceptor());
  app.use(sseMiddleware);
  app.use(cookieParser());

  // Pass the Nest app instance to QueueService
  const queueService = app.get(QueueService);
  queueService.setAppInstance(app); // Inject the app instance into QueueService

  app.use(bodyParser.json({ limit: '20mb' }));
  app.use(bodyParser.urlencoded({ limit: '20mb', extended: true }));
  app.useLogger(app.get(Logger));

  app.useStaticAssets(join(__dirname, '..', 'public'), { prefix: '/' });
  app.setBaseViewsDir(join(__dirname, '..', 'views'));
  app.setViewEngine('ejs');

  const configService = app.get(ConfigService);
  await app.listen(configService.get('APP_PORT'));
}
bootstrap();
