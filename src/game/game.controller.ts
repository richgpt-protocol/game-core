import {
  Controller,
  Get,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Secure } from 'src/shared/decorators/secure.decorator';
import { ResponseVo } from 'src/shared/vo/response.vo';
import { GameService } from './game.service';

@ApiTags('Game')
@Controller('api/v1/game')
export class GameController {
  constructor(private gameService: GameService) {}

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