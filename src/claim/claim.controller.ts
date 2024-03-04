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
import { ClaimService } from './claim.service';
import { ClaimDto } from './dto/Claim.dto';

@ApiTags('Claim')
@Controller('api/v1/claim')
export class ClaimController {
  constructor(
    private claimService: ClaimService,
  ) {}

  @Secure(null, UserRole.USER)
  @Post('claim')
  async claim(
    @Request() req,
    @Body() payload: ClaimDto[],
  ) {
    try {
      const res = await this.claimService.claim(req.user.userId, payload)
      return {
        statusCode: HttpStatus.OK,
        data: res,
        message: 'claim success',
      };

    } catch (error) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        message: error.message,
      };
    }
  }

  // TODO
  @Secure(null, UserRole.USER)
  @Get('get-user-claim')
  async getUserClaim() {}
}
