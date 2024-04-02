import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Secure } from 'src/shared/decorators/secure.decorator';
import { ResponseVo } from 'src/shared/vo/response.vo';
import { GameService } from './game.service';
import { UserRole } from 'src/shared/enum/role.enum';

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

  @Secure(null, UserRole.USER)
  @Get('get-past-draw-results')
  async getPastDrawResults(
    @Body() payload: { gameIds: number[] }
  ) {
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