import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  Request,
} from '@nestjs/common';
import { ApiBody, ApiHeader, ApiHeaders, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { I18n, I18nContext } from 'nestjs-i18n';
import { AdminService } from 'src/admin/admin.service';
import { SseService } from 'src/admin/sse/sse.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { MobileCountries } from 'src/shared/constants/mobile-country.constant';
import { HandlerClass } from 'src/shared/decorators/handler-class.decorator';
import { IpAddress } from 'src/shared/decorators/ip-address.decorator';
import { Secure } from 'src/shared/decorators/secure.decorator';
import { UserRole } from 'src/shared/enum/role.enum';
import { IHandlerClass } from 'src/shared/interfaces/handler-class.interface';
import { SMSService } from 'src/shared/services/sms.service';
import { DateUtil } from 'src/shared/utils/date.util';
import { RandomUtil } from 'src/shared/utils/random.util';
import {
  ErrorResponseVo,
  ResponseListVo,
  ResponseVo,
} from 'src/shared/vo/response.vo';
import { DepositService } from './deposit.service';
import { DepositDTO } from './dto/deposit.dto';
import { ConfigService } from 'src/config/config.service';

@ApiTags('Deposit')
@Controller('api/v1/deposit')
export class DepositController {
  constructor(
    private depositService: DepositService,
    private configService: ConfigService,
  ) {}

  @Post('deposit')
  @ApiHeaders([
    {
      name: 'x-secret',
      description: 'Deposit bot secret',
    },
  ])
  @ApiBody({ type: DepositDTO })
  async deposit(
    @Req() req: Request,
    @Body() payload: DepositDTO,
  ): Promise<ResponseVo<any>> {
    const headerSecret = req.headers['x-secret'];
    if (headerSecret !== this.configService.get('DEPOSIT_BOT_SECRET')) {
      throw new BadRequestException('Invalid secret');
    }
    await this.depositService.processDeposit(payload);

    return {
      statusCode: HttpStatus.OK,
      data: {},
      message: 'Deposit',
    };
  }
}
