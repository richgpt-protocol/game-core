import {
  forwardRef,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { PermissionModule } from 'src/permission/permission.module';
import { SseController } from './sse.controller';
import { SseMiddleware } from './sse.middleware';
import { SseService } from './sse.service';

@Module({
  imports: [forwardRef(() => PermissionModule)],
  controllers: [SseController],
  providers: [SseService],
  exports: [SseService],
})
export class SseModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SseMiddleware).forRoutes(SseController);
  }
}
