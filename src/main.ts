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

// Add global unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED PROMISE REJECTION:', reason);
  // Log additional details that might help with debugging
  console.error('Promise:', promise);
  if (reason instanceof Error) {
    console.error('Stack trace:', reason.stack);
  }
  // Don't exit the process - just log the error
});

// Add global uncaught exception handler
process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION:', error);
  console.error('Stack trace:', error.stack);
  // Don't exit the process - just log the error
});

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
