import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Secure } from 'src/shared/decorators/secure.decorator';
import { UserRole } from 'src/shared/enum/role.enum';
import { ResponseVo } from 'src/shared/vo/response.vo';
import { GameService } from './game.service';
// import { SendMessageDto } from './dto/bet.dto';
import { DrawResultDto } from './dto/drawResult.dto';
import { PermissionEnum } from 'src/shared/enum/permission.enum';
import { BetDto } from './dto/Bet.dto';
import { BetService } from './bet.service';

@ApiTags('Game')
@Controller('api/v1/game')
export class GameController {
  constructor(
    private gameService: GameService,
    private betService: BetService,
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

  // // TODO: input number[], epoch and return max allowed bet for that number for that epoch
  // @Get('get-max-allowed-bet')
  // async getMaxAllowedBet() {}

  // @Get('get-draw-result')
  // @ApiHeader({
  //   name: 'x-custom-lang',
  //   description: 'Custom Language',
  // })
  // @ApiResponse({
  //   status: HttpStatus.OK,
  //   description: 'OK',
  //   type: ResponseVo,
  // })
  // async getDrawResult(
  //   @Query('epoch') epoch: number,
  //   // @IpAddress() ipAddress,
  //   // @HandlerClass() classInfo: IHandlerClass,
  //   // @I18n() i18n: I18nContext,
  // ): Promise<ResponseVo<any>> {
  //   const { id, ...drawResult } = await this.gameService.getDrawResult(epoch);
  //   return {
  //     statusCode: HttpStatus.OK,
  //     data: drawResult,
  //     message: 'draw result get successfully',
  //   };
  // }

  // // TODO???
  // @Get('get-past-draw-result')
  // async getPastDrawResult(
  //   @Query('startEpoch') startEpoch: number,
  //   @Query('endEpoch') endEpoch: number, // inclusive
  // ) {}

  // // TODO, sort descending by winner amount
  // @Get('get-past-draw-winner')
  // async getPastDrawWinner(
  //   @Query('startEpoch') startEpoch: number,
  //   @Query('endEpoch') endEpoch: number, // inclusive
  // ) {}

  // // TODO, sum up and sort descending by winner amount
  // @Get('get-draw-leaderboard')
  // async getDrawLeaderboard() {}

  // // TODO, after finalize xp
  // @Get('get-xp-leaderboard')
  // async getXPLeaderboard() {}

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
      const userId = req.user.userId;
      // const userId = 1;
      const data = await this.betService.bet(userId, payload);
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
      data: {
        value: data,
      },
      message: '',
    };
  }
}
