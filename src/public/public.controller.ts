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
import { ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PublicService } from './public.service';
import { SecretTokenGuard } from 'src/shared/guards/secret-token.guard';
import { ResponseVo } from 'src/shared/vo/response.vo';
import { GetProfileDto } from './dtos/get-profile.dto';
import { UpdateUserGameDto } from './dtos/update-user-game.dto';
import { UpdateTaskXpDto } from './dtos/update-task-xp.dto';
import { UpdateUserTelegramDto } from './dtos/update-user-telegram.dto';
import { GetOttDto } from './dtos/get-ott.dto';
import { LiteBetDto } from './dtos/lite-bet.dto';
import { RequestWithdrawDto, SetWithdrawPinDto } from './dtos/withdraw.dto';
import { SquidGameTicketListDto } from './dtos/squid-game.dto';
import { ClaimJackpotDto } from './dtos/claim.dto';

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
    const data = await this.publicService.bet(payload.uid, payload.bets);
    return {
      statusCode: HttpStatus.CREATED,
      data,
      message: 'Success',
    };
  }

  @UseGuards(SecretTokenGuard)
  @Get('get-deposit-info')
  @ApiResponse({
    status: 200,
    description: 'Get deposit info',
    type: ResponseVo,
  })
  async getDepositInfo(): Promise<ResponseVo<any>> {
    const data = await this.publicService.getDepositInfo();
    return {
      statusCode: HttpStatus.OK,
      data,
      message: 'Success',
    };
  }

  @UseGuards(SecretTokenGuard)
  @Get('get-user-address/:uid')
  @ApiResponse({
    status: 200,
    description: 'Get user address',
    type: ResponseVo,
  })
  async getUserAddress(@Param('uid') uid: string): Promise<ResponseVo<any>> {
    const data = await this.publicService.getUserWalletAddress(uid);
    return {
      statusCode: HttpStatus.OK,
      data,
      message: 'Success',
    };
  }

  @UseGuards(SecretTokenGuard)
  @Get('get-withdraw-info')
  @ApiResponse({
    status: 200,
    description: 'Get withdraw info',
    type: ResponseVo,
  })
  async getWithdrawInfo(): Promise<ResponseVo<any>> {
    const data = await this.publicService.getWithdrawInfo();
    return {
      statusCode: HttpStatus.OK,
      data,
      message: 'Success',
    };
  }

  @UseGuards(SecretTokenGuard)
  @Get('get-user-withdrawable-info')
  @ApiQuery({ name: 'uid', required: true })
  @ApiQuery({ name: 'chainId', required: true })
  @ApiResponse({
    status: 200,
    description: 'Get withdrawable balance',
    type: ResponseVo,
  })
  async getUserWithdrawableInfo(
    @Query('uid') uid: string,
    @Query('chainId') chainId: number,
  ): Promise<ResponseVo<any>> {
    const data = await this.publicService.getUserWithdrawableInfo(uid, chainId);
    return {
      statusCode: HttpStatus.OK,
      data,
      message: 'Success',
    };
  }

  @UseGuards(SecretTokenGuard)
  @Post('request-withdraw')
  @ApiResponse({
    status: 201,
    description: 'Request withdraw',
    type: ResponseVo,
  })
  async requestWithdraw(
    @Body() payload: RequestWithdrawDto,
  ): Promise<ResponseVo<any>> {
    const data = await this.publicService.withdraw(payload);
    return {
      statusCode: HttpStatus.CREATED,
      data,
      message: 'Success',
    };
  }

  @UseGuards(SecretTokenGuard)
  @Post('update-withdraw-pin')
  @ApiResponse({
    status: 201,
    description: 'Update withdraw pin',
    type: ResponseVo,
  })
  async updateWithdrawPin(
    @Body() payload: SetWithdrawPinDto,
  ): Promise<ResponseVo<any>> {
    const data = await this.publicService.setWithdrawPassword(payload);
    return {
      statusCode: HttpStatus.CREATED,
      data,
      message: 'Success',
    };
  }

  @UseGuards(SecretTokenGuard)
  @Get('get-squid-game-info/:uid')
  @ApiParam({ name: 'uid', required: true })
  @ApiResponse({
    status: 200,
    description: 'Get squid game info',
    type: ResponseVo,
  })
  async getSquidGameInfo(@Param('uid') uid: string): Promise<ResponseVo<any>> {
    const data = await this.publicService.getSquidGameInfo(uid);
    return {
      statusCode: HttpStatus.OK,
      data,
      message: 'Success',
    };
  }

  @UseGuards(SecretTokenGuard)
  @Post('get-user-squid-game-tickets')
  @ApiResponse({
    status: 200,
    description: 'Get user squid game tickets',
    type: ResponseVo,
  })
  async getUserSquidGameTickers(
    @Body() payload: SquidGameTicketListDto,
  ): Promise<ResponseVo<any>> {
    const data = await this.publicService.getSquidGameTicketList(payload);
    return {
      statusCode: HttpStatus.OK,
      data,
      message: 'Success',
    };
  }

  @UseGuards(SecretTokenGuard)
  @Get('get-deposit-tasks/:uid')
  @ApiParam({ name: 'uid', required: true })
  @ApiResponse({
    status: 200,
    description: 'Get deposit tasks',
    type: ResponseVo,
  })
  async getDepositTaskInfo(
    @Param('uid') uid: string,
  ): Promise<ResponseVo<any>> {
    const data = await this.publicService.getDepositTaskInfo(uid);
    return {
      statusCode: HttpStatus.OK,
      data,
      message: 'Success',
    };
  }

  @UseGuards(SecretTokenGuard)
  @Post('claim-jackpot')
  @ApiResponse({
    status: 201,
    description: 'Claim Jackpot',
    type: ResponseVo,
  })
  async claimJackpot(
    @Body() payload: ClaimJackpotDto,
  ): Promise<ResponseVo<any>> {
    const data = await this.publicService.claimJackpotRewards(payload.uid);
    return {
      statusCode: HttpStatus.CREATED,
      data,
      message: 'Success',
    };
  }

  @UseGuards(SecretTokenGuard)
  @Post('get-jackpot-tickets')
  @ApiResponse({
    status: 200,
    description: 'Get user jackpot tickets',
    type: ResponseVo,
  })
  async getUserJackpotTickers(
    @Body() payload: SquidGameTicketListDto,
  ): Promise<ResponseVo<any>> {
    const data = await this.publicService.getJackpotTicketList(payload);
    return {
      statusCode: HttpStatus.OK,
      data,
      message: 'Success',
    };
  }

  @UseGuards(SecretTokenGuard)
  @Post('get-new-jackpot-tickets')
  @ApiResponse({
    status: 200,
    description: 'Get user jackpot tickets',
    type: ResponseVo,
  })
  async getNewJackpotTickers(
    @Body() payload: SquidGameTicketListDto,
  ): Promise<ResponseVo<any>> {
    const data = await this.publicService.getJackpotTickets(payload);
    return {
      statusCode: HttpStatus.OK,
      data,
      message: 'Success',
    };
  }

  @UseGuards(SecretTokenGuard)
  @Get('get-jackpot-info')
  @ApiResponse({
    status: 200,
    description: 'Get jackpot info',
    type: ResponseVo,
  })
  async getJackpotInfo(): Promise<ResponseVo<any>> {
    const data = await this.publicService.getCurrentJackpot();
    return {
      statusCode: HttpStatus.OK,
      data,
      message: 'Success',
    };
  }
}
