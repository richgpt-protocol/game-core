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

@ApiTags('Public')
@Controller('api/v1/public')
export class PublicController {
  constructor(private publicService: PublicService) {}

  @UseGuards(SecretTokenGuard)
  @Get('profile')
  @ApiResponse({
    status: 200,
    description: 'Get user profile',
    type: ResponseVo,
  })
  async getProfile(@Query() payload: GetProfileDto): Promise<ResponseVo<any>> {
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
}
