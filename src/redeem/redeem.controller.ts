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
    Request,
  } from '@nestjs/common';
  import { ApiHeader, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
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
import { RedeemService } from './redeem.service';
import { RedeemDto } from './dto/redeem.dto';
import { GameService } from 'src/game/game.service';

@ApiTags('Redeem')
@Controller('api/v1/redeem')
export class RedeemController {
  constructor(
    private redeemService: RedeemService,
  ) {}

//   @Secure(null, UserRole.USER)
//   @Post('redeem')
//   async redeem(@Request() req, @Body() payload: RedeemDto) {
//     try {
//       await this.redeemService.redeem(req.user.userId, payload);
//       return {
//         statusCode: HttpStatus.OK,
//         data: null,
//         message: 'redeem success',
//       };
//     } catch (error) {
//       return {
//         statusCode: HttpStatus.BAD_REQUEST,
//         data: null,
//         message: error.message,
//       };
//     }
//   }
}
