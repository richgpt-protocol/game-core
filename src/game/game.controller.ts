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
import { DrawResultDto } from './dto/drawResult.dto';
import { ConfigService } from 'src/config/config.service';
import { PermissionEnum } from 'src/shared/enum/permission.enum';

@ApiTags('Game')
@Controller('api/v1/game')
export class GameController {
  constructor(
    private gameService: GameService,
    private configService: ConfigService,
  ) {}

  // TODO: bet close 1 minute before draw result
  @Secure(PermissionEnum.SET_BET_CLOSE, UserRole.ADMIN)
  @Post('set-bet-close')
  async setBetClose() {
    return {
      statusCode: HttpStatus.OK,
      data: null,
      message: 'set bet close success',
    };
  }

  @Secure(null, UserRole.ADMIN)
  @Post('set-draw-result')
  async setDrawResult(@Request() req, @Body() payload: DrawResultDto) {
    try {
      await this.gameService.setDrawResult(req.user.userId, payload);
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

  // TODO: input number[], epoch and return max allowed bet for that number for that epoch
  @Get('get-max-allowed-bet')
  async getMaxAllowedBet() {}

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
    @Query('epoch') epoch: number,
    // @IpAddress() ipAddress,
    // @HandlerClass() classInfo: IHandlerClass,
    // @I18n() i18n: I18nContext,
  ): Promise<ResponseVo<any>> {
    const { id, ...drawResult } = await this.gameService.getDrawResult(epoch);
    return {
      statusCode: HttpStatus.OK,
      data: drawResult,
      message: 'draw result get successfully',
    };
  }

  @Post('trigger-draw-result')
  async triggerDrawResult(@Request() req) {
    try {
      const secret = req.headers['secret'];
      if (secret !== this.configService.get('RESULT_BOT_SECRET')) {
        throw new BadRequestException('invalid secret');
      }
      await this.gameService.triggerDrawResult();
      return {
        statusCode: HttpStatus.OK,
        data: null,
        message: 'trigger draw result success',
      };
    } catch (error) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        message: error.message,
      };
    }
  }

  // TODO???
  @Get('get-past-draw-result')
  async getPastDrawResult(
    @Query('startEpoch') startEpoch: number,
    @Query('endEpoch') endEpoch: number, // inclusive
  ) {}

  // TODO, sort descending by winner amount
  @Get('get-past-draw-winner')
  async getPastDrawWinner(
    @Query('startEpoch') startEpoch: number,
    @Query('endEpoch') endEpoch: number, // inclusive
  ) {}

  // TODO, sum up and sort descending by winner amount
  @Get('get-draw-leaderboard')
  async getDrawLeaderboard() {}

  // TODO, after finalize xp
  @Get('get-xp-leaderboard')
  async getXPLeaderboard() {}
}
