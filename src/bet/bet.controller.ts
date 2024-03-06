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
import { BetService } from './bet.service';
import { BetDto, FormatBetsDTO } from './dto/bet.dto';

@ApiTags('Bet')
@Controller('api/v1/bet')
export class BetController {
  constructor(private betService: BetService) {}

  @Secure(null, UserRole.USER)
  @Post('bet')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OK',
    type: ResponseVo,
  })
  async bet(
    @Request() req,
    @Body() payload: BetDto[],
    // @IpAddress() ipAddress,
    // @HandlerClass() classInfo: IHandlerClass,
    // @I18n() i18n: I18nContext,
  ): Promise<ResponseVo<any>> {
    try {
      const data = await this.betService.bet(req.user.userId, payload);
      return {
        statusCode: HttpStatus.OK,
        data,
        message: 'bet success',
      };
    } catch (error) {
      console.log(error);
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        message: '',
      };
    }
  }

  // TODO: update bet after set draw result
  @Secure(null, UserRole.ADMIN)
  @Post('set-last-minute-bet')
  async setLastMinuteBet() {}

  @Secure(null, UserRole.USER)
  @Get('get-user-bets')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OK',
    type: ResponseVo,
  })
  async getUserBets(
    @Request() req,
    @Query('epoch') epoch: number,
    // @IpAddress() ipAddress,
    // @HandlerClass() classInfo: IHandlerClass,
    // @I18n() i18n: I18nContext,
  ): Promise<ResponseVo<any>> {
    const bets = await this.betService.getUserBets(req.user.userId, epoch);
    return {
      statusCode: HttpStatus.OK,
      data: bets,
      message: '',
    };
  }

  @Secure(null, UserRole.USER)
  @Post('get-bet-amount')
  async getBetAmount(
    @Body() payload: FormatBetsDTO[],
  ): Promise<ResponseVo<any>> {
    const totalAmount = await this.betService.estimateBetAmount(payload);
    return {
      statusCode: HttpStatus.OK,
      data: { totalAmount },
      message: '',
    };
  }

  @Secure(null, UserRole.USER)
  @Post('format-bets')
  async formatBets(@Body() payload: FormatBetsDTO[]): Promise<ResponseVo<any>> {
    const bets = await this.betService.formatBets(payload);
    return {
      statusCode: HttpStatus.OK,
      data: bets,
      message: '',
    };
  }
}
