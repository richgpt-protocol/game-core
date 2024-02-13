import { Controller, Get } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { Secure } from 'src/shared/decorators/secure.decorator';
import { UserRole } from 'src/shared/enum/role.enum';

@Controller('sse')
export class SseController {
  @Secure(null, UserRole.ADMIN)
  @ApiExcludeEndpoint()
  @Get()
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  get() {
    console.log('get');
    return;
  }
}
