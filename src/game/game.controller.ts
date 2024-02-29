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
  import { GameService } from './game.service';
// import { SendMessageDto } from './dto/bet.dto';
import { User } from 'src/user/entities/user.entity';
import { Repository } from 'typeorm';
import { BetDto } from './dto/bet.dto';
import { ClaimDto } from './dto/claim.dto';
import { RedeemDto } from './dto/redeem.dto';
import { DrawResultDto } from './dto/drawResult.dto';

@ApiTags('Game')
@Controller('api/v1/game')
export class GameController {
  constructor(
    private gameService: GameService,
  ) {}

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
      await this.gameService.bet(req.user.userId, payload)
      return {
        statusCode: HttpStatus.OK,
        data: null,
        message: 'bet success',
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
  @Post('claim')
  async claim(
    @Request() req,
    @Body() payload: ClaimDto[],
  ) {
    try {
      const res = await this.gameService.claim(req.user.userId, payload)
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

  @Secure(null, UserRole.USER)
  @Post('redeem')
  async redeem(
    @Request() req,
    @Body() payload: RedeemDto,
  ) {
    try {
      await this.gameService.redeem(req.user.userId, payload)
      return {
        statusCode: HttpStatus.OK,
        data: null,
        message: 'redeem success',
      };

    } catch (error) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        message: error.message,
      };
    }
  }

  // TODO: bet close 1 minute before draw result
  @Secure(null, UserRole.ADMIN)
  @Post('set-bet-close')
  async setBetClose() {}

  @Secure(null, UserRole.ADMIN)
  @Post('set-draw-result')
  async setDrawResult(
    @Request() req,
    @Body() payload: DrawResultDto,
  ) {
    try {
      await this.gameService.setDrawResult(req.user.userId, payload)
      return {
        statusCode: HttpStatus.OK,
        data: null,
        message: 'set draw result success',
      };

    } catch (error) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        message: error.message,
      };
    }
  }

  // TODO: update bet after set draw result
  @Secure(null, UserRole.ADMIN)
  @Post('set-last-minute-bet')
  async setLastMinuteBet() {}

  // TODO: payout if any redeem
  @Secure(null, UserRole.ADMIN)
  @Post('payout')
  async payout() {}

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
    const bets = await this.gameService.getUserBets(req.user.userId, epoch)
    return {
      statusCode: HttpStatus.OK,
      data: bets,
      message: '',
    };
  }

  @Get('get-draw-result')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OK',
    type: ResponseVo,
  })
  async getDrawResult(
    @Request() req,
    @Query('epoch') epoch: number,
    // @IpAddress() ipAddress,
    // @HandlerClass() classInfo: IHandlerClass,
    // @I18n() i18n: I18nContext,
  ): Promise<ResponseVo<any>> {
    const {id, submitAt, ...drawResult} = await this.gameService.getDrawResult(epoch)
    return {
      statusCode: HttpStatus.OK,
      data: drawResult,
      message: 'draw result get successfully',
    };
  }

  // TODO
  @Secure(null, UserRole.USER)
  @Get('get-redeem-status')
  async getRedeemStatus() {}
}
