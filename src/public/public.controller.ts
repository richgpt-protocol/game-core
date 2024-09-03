import {
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
}
