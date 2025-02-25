import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpStatus,
  Logger,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Secure } from 'src/shared/decorators/secure.decorator';
import { ResponseVo } from 'src/shared/vo/response.vo';
import { GameService } from './game.service';
import { UserRole } from 'src/shared/enum/role.enum';
import { PastResultDto } from './dto/pastResult.dto';
import { BetDto } from './dto/Bet.dto';
import { BetService } from './bet.service';
import { RestartBetDto, RestartReferralDistribution } from './dto/restart.dto';
import { I18n, I18nContext } from 'nestjs-i18n';

@ApiTags('Game')
@Controller('api/v1/game')
export class GameController {
  private readonly logger = new Logger(GameController.name);

  constructor(
    private gameService: GameService,
    private betService: BetService,
  ) {}

  @Secure()
  @Get('get-all-bets')
  async getAllBets() {
    try {
      const result = await this.gameService.getAllBets();
      return {
        statusCode: HttpStatus.OK,
        data: result.data,
        message: 'get all bets success',
      };
    } catch (error) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        message: error.message,
      };
    }
  }

  // @Secure(null, UserRole.USER)
  @Get('get-available-games')
  async getAvailableGames() {
    try {
      const availableGames = await this.gameService.getAvailableGames();
      return {
        statusCode: HttpStatus.OK,
        data: availableGames,
        message: 'get available games success',
      };
    } catch (error) {
      this.logger.error(error);
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        message: 'get available games failed',
      };
    }
  }

  @Secure(null, UserRole.USER)
  @Get('get-leaderboard')
  async getLeaderboard(@Query('count') count: number) {
    try {
      const leaderboard = await this.gameService.getLeaderboard(count);
      return {
        statusCode: HttpStatus.OK,
        data: leaderboard,
        message: 'get leaderboard success',
      };
    } catch (error) {
      this.logger.error(error);
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        message: 'get leaderboard failed',
      };
    }
  }

  @Secure(null, UserRole.USER)
  @Get('get-past-draw-results')
  async getPastDrawResults(@Body() payload: { gameIds: number[] }) {
    try {
      const result = await this.gameService.getPastDrawResults(payload.gameIds);
      return {
        statusCode: HttpStatus.OK,
        data: result.data,
        message: 'get past draw result success',
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
  @Get('get-past-result')
  async getPastResult(@Query() query: PastResultDto) {
    try {
      if ((query.startDate || query.endDate) && query.numberPair) {
        throw new Error('date and numberPair cannot be used together');
      }

      if (!(query.startDate || query.endDate) && !query.numberPair) {
        throw new Error('either date or numberPair must be provided');
      }

      const pastResult = await this.gameService.getPastResult(
        query.count,
        query.startDate,
        query.endDate,
        query.numberPair,
      );

      return {
        statusCode: HttpStatus.OK,
        data: pastResult,
        message: 'get past result success',
      };
    } catch (error) {
      // todo: inform if error come from throw above
      this.logger.error(error);
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        message: 'get past result failed',
      };
    }
  }

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
    @I18n() i18n: I18nContext,
  ): Promise<ResponseVo<any>> {
    try {
      const userId = req.user.userId;
      const data = await this.betService.bet(userId, payload);
      return {
        statusCode: HttpStatus.OK,
        data,
        message: 'bet success',
      };
    } catch (error) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        message: i18n.translate(error.message),
      };
    }
  }

  @Secure(null, UserRole.ADMIN)
  @Post('restart-bet')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OK',
    type: ResponseVo,
  })
  async restartBet(
    @Request() req,
    @Body() payload: RestartBetDto,
  ): Promise<ResponseVo<any>> {
    try {
      const data = await this.betService.restartBet(
        payload.gameUsdTxId,
        payload.userId,
      );
      return {
        statusCode: HttpStatus.OK,
        data,
        message: 'bet success',
      };
    } catch (error) {
      this.logger.error(error);
      throw new BadRequestException(error.message);
    }
  }

  @Secure(null, UserRole.ADMIN)
  @Post('restart-winning-bonus')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OK',
    type: ResponseVo,
  })
  async reProcessReferralBonus(
    @Request() req,
    @Body() payload: { gameId: number; betOrderId: number },
  ): Promise<ResponseVo<any>> {
    try {
      const data = await this.gameService.reProcessReferralBonus(
        payload.gameId,
        payload.betOrderId,
      );
      return {
        statusCode: HttpStatus.OK,
        data,
        message: 'Processing referral bonus',
      };
    } catch (error) {
      this.logger.error(error);
      throw new BadRequestException(error.message);
    }
  }

  @Secure(null, UserRole.ADMIN)
  @Post('restart-referral-distribution')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OK',
    type: ResponseVo,
  })
  async restartReferralDistribution(
    @Request() req,
    @Body() payload: RestartReferralDistribution,
  ): Promise<ResponseVo<any>> {
    try {
      const data = await this.betService.restartHandleReferralFlow(
        payload.walletTxId,
        payload.gameUsdTxId,
      );
      return {
        statusCode: HttpStatus.OK,
        data,
        message: 'update referral distribution success',
      };
    } catch (error) {
      this.logger.error(error);
      throw new BadRequestException(error.message);
    }
  }

  @Secure(null, UserRole.USER)
  @Get('recent-bets')
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OK',
    type: ResponseVo,
  })
  async getRecentBets(@Query('count') count: number) {
    try {
      const data = await this.betService.getRecentBets(count);
      return {
        statusCode: HttpStatus.OK,
        data,
        message: 'get recent bets success',
      };
    } catch (error) {
      this.logger.error(error);
      throw new BadRequestException(error.message);
    }
  }

  @Secure(null, UserRole.USER)
  @Get('get-bets')
  @ApiQuery({
    name: 'startEpoch',
    required: false,
  })
  @ApiQuery({
    name: 'page',
    required: false,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
  })
  async get_bets(
    @Request() req,
    @Query('startEpoch') startEpoch: number,
    @Query('page') page: number,
    @Query('limit') limit: number,
  ) {
    const data = await this.betService.getBets(
      req.user.userId,
      // 1,
      startEpoch,
      page,
      limit,
    );
    return {
      statusCode: HttpStatus.OK,
      data,
      message: 'get bets success',
    };
  }

  @Post('estimate-bet-amount')
  @ApiBody({
    required: true,
    type: BetDto,
    isArray: true,
  })
  async estimateBetAmount(@Body() bets: BetDto[]) {
    const data = await this.betService.estimateBetAmount(bets);
    return {
      statusCode: HttpStatus.OK,
      data,
      message: '',
    };
  }

  @Secure(null, UserRole.USER)
  @Get('get-epoch-by-date')
  @ApiQuery({
    name: 'startDate',
    required: true,
  })
  @ApiQuery({
    name: 'endDate',
    required: true,
  })
  async getEpochByDate(
    @Request() req,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    try {
      const data = await this.gameService.getEpochByDate(startDate, endDate);
      return {
        statusCode: HttpStatus.OK,
        data,
        message: 'get epoch by date success',
      };
    } catch (error) {
      this.logger.error(error);
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        message: 'get epoch by date failed',
      };
    }
  }
}
