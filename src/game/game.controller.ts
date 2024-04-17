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
import { PastResultDto } from './dto/pastResult.dto';

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

  @Secure(null, UserRole.USER)
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
      console.error(error)
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
      console.error(error)
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        message: 'get leaderboard failed',
      };
    }
  }

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

  @Secure(null, UserRole.USER)
  @Get('get-past-result')
  async getPastResult(
    @Query() query: PastResultDto,
  ) {
    try {

      if (query.date && query.numberPair) {
        throw new Error('date and numberPair cannot be used together');
      }

      if (!query.date && !query.numberPair) {
        throw new Error('either date or numberPair must be provided');
      }
      
      const pastResult = await this.gameService.getPastResult(
        query.count,
        query.date,
        query.numberPair,
      );

      return {
        statusCode: HttpStatus.OK,
        data: pastResult,
        message: 'get past result success',
      };

    } catch (error) {
      // todo: inform if error come from throw above
      console.log(error)
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        message: 'get past result failed',
      };
    }
  }
}