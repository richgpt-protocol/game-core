import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { PublicService } from './public.service';
import { SecretTokenGuard } from 'src/shared/guards/secret-token.guard';
import { ResponseVo } from 'src/shared/vo/response.vo';
import { GetProfileDto } from './dtos/get-profile.dto';
import { UpdateUserGameDto } from './dtos/update-user-game.dto';
import { UpdateTaskXpDto } from './dtos/update-task-xp.dto';
import { UpdateUserTelegramDto } from './dtos/update-user-telegram.dto';
import { GetOttDto } from './dtos/get-ott.dto';
import { LiteBetDto } from './dtos/lite-bet.dto';

@ApiTags('Public')
@Controller('api/v1/public')
export class PublicController {
  constructor(private publicService: PublicService) {}

  @UseGuards(SecretTokenGuard)
  @Get('profile-by-uid')
  @ApiResponse({
    status: 200,
    description: 'Get user profile by uid',
    type: ResponseVo,
  })
  async getProfileByUid(
    @Query() payload: GetProfileDto,
  ): Promise<ResponseVo<any>> {
    const data = await this.publicService.findUser(payload);
    return {
      statusCode: HttpStatus.OK,
      data,
      message: 'Success',
    };
  }

  @UseGuards(SecretTokenGuard)
  @Post('profile-by-tgid')
  @ApiResponse({
    status: 200,
    description: 'Get user profile by telegram ID',
    type: ResponseVo,
  })
  async getProfile(@Body() payload: GetProfileDto): Promise<ResponseVo<any>> {
    const data = await this.publicService.findUser(payload);
    return {
      statusCode: HttpStatus.OK,
      data,
      message: 'Success',
    };
  }

  @UseGuards(SecretTokenGuard)
  @Get('level/:point')
  @ApiResponse({
    status: 200,
    description: 'Calculate user level by point',
    type: ResponseVo,
  })
  async calculateUserLevel(
    @Param('point') point: number,
  ): Promise<ResponseVo<any>> {
    const data = await this.publicService.calculateUserLevel(point);
    return {
      statusCode: HttpStatus.OK,
      data,
      message: 'Success',
    };
  }

  @UseGuards(SecretTokenGuard)
  @Post('game')
  @ApiResponse({
    status: 200,
    description: 'Update user game details',
    type: ResponseVo,
  })
  async updateUserGame(
    @Body() payload: UpdateUserGameDto,
  ): Promise<ResponseVo<any>> {
    const data = await this.publicService.updateUserGame(payload);
    return {
      statusCode: HttpStatus.OK,
      data,
      message: 'Success',
    };
  }

  @UseGuards(SecretTokenGuard)
  @Post('task-xp')
  @ApiResponse({
    status: 200,
    description: 'Update user task details',
    type: ResponseVo,
  })
  async updateTaskXp(
    @Body() payload: UpdateTaskXpDto,
  ): Promise<ResponseVo<any>> {
    const data = await this.publicService.updateTaskXP(payload);
    return {
      statusCode: HttpStatus.OK,
      data,
      message: 'Success',
    };
  }

  @UseGuards(SecretTokenGuard)
  @Post('update-user-telegram')
  @ApiResponse({
    status: 200,
    description: 'Update user telegram',
    type: ResponseVo,
  })
  async updateUserTelegram(
    @Body() payload: UpdateUserTelegramDto,
  ): Promise<ResponseVo<any>> {
    const data = await this.publicService.updateUserTelegram(payload);
    if (data) {
      return {
        statusCode: HttpStatus.OK,
        data: null,
        message: data.message,
      };
    }

    return {
      statusCode: HttpStatus.OK,
      data: null,
      message: 'Success',
    };
  }

  @UseGuards(SecretTokenGuard)
  @Post('create-ott')
  @ApiResponse({
    status: 200,
    description: 'Create OTT for user',
    type: ResponseVo,
  })
  async createOtt(@Body() payload: GetOttDto): Promise<ResponseVo<any>> {
    const data = await this.publicService.createOtt(payload);
    return {
      statusCode: HttpStatus.OK,
      data,
      message: 'Success',
    };
  }

  @UseGuards(SecretTokenGuard)
  @Get('get-draw-info')
  @ApiResponse({
    status: 200,
    description: 'Get draw info',
    type: ResponseVo,
  })
  async getDrawInfo(): Promise<ResponseVo<any>> {
    const data = await this.publicService.getDrawInfo();
    return {
      statusCode: HttpStatus.OK,
      data,
      message: 'Success',
    };
  }

  @UseGuards(SecretTokenGuard)
  @Get('get-recent-transactions')
  @ApiResponse({
    status: 200,
    description: 'Get recent transactions',
    type: ResponseVo,
  })
  async getRecentTransactions(): Promise<ResponseVo<any>> {
    const data = await this.publicService.getRecentTransactions();
    return {
      statusCode: HttpStatus.OK,
      data,
      message: 'Success',
    };
  }

  @UseGuards(SecretTokenGuard)
  @Get('get-active-campaign-with-banners')
  @ApiResponse({
    status: 200,
    description: 'Get active campaign with banners',
    type: ResponseVo,
  })
  async getActiveCampaignWithBanners(): Promise<ResponseVo<any>> {
    const data = await this.publicService.getCampaigbnInfo();
    return {
      statusCode: HttpStatus.OK,
      data,
      message: 'Success',
    };
  }

  @UseGuards(SecretTokenGuard)
  @Post('lite-bet')
  @ApiResponse({
    status: 201,
    description: 'Get lite bet',
    type: ResponseVo,
  })
  async liteBet(@Body() payload: LiteBetDto): Promise<ResponseVo<any>> {
    try {
      const data = await this.publicService.bet(payload.uid, payload.bets);
      return {
        statusCode: HttpStatus.CREATED,
        data,
        message: 'Success',
      };
    } catch (ex) {
      console.log(ex);
      throw new BadRequestException(ex.message);
    }
  }
}
