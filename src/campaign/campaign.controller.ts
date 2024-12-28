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
import { ApiHeader, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Secure, SecureEJS } from 'src/shared/decorators/secure.decorator';
import { PermissionEnum } from 'src/shared/enum/permission.enum';
import { UserRole } from 'src/shared/enum/role.enum';
import { CampaignService } from './campaign.service';
import { CreateCampaignDto, ExecuteClaimDto } from './dto/campaign.dto';
import { ResponseVo } from 'src/shared/vo/response.vo';

@ApiTags('campaign')
@Controller('api/v1/campaign')
export class CampaignController {
  private readonly logger = new Logger(CampaignController.name);
  constructor(private campaignService: CampaignService) {}

  @SecureEJS(PermissionEnum.UPDATE_SITE_SETTING, UserRole.ADMIN)
  @Post('create')
  async create(@Body() payload: CreateCampaignDto): Promise<ResponseVo<any>> {
    try {
      await this.campaignService.createCampaign(payload);
      return {
        statusCode: HttpStatus.OK,
        data: {},
        message: 'Campaign created successfully',
      };
    } catch (error) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: {},
        message: 'Failed to create campaign',
      };
    }
  }

  @Secure(null, UserRole.ADMIN)
  @Post('execute-claim')
  async retryExecuteClaim(
    @Body() params: ExecuteClaimDto,
  ): Promise<ResponseVo<any>> {
    try {
      await this.campaignService.manualExecuteClaim(params);
      return {
        statusCode: HttpStatus.OK,
        data: {},
        message: 'Campaign execution initiated successfully',
      };
    } catch (error) {
      const message =
        error instanceof BadRequestException
          ? error.message
          : 'Failed to execute campaign claim';
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: {},
        message,
      };
    }
  }

  @Secure(null, UserRole.USER)
  @Get('squid-game-participant')
  async getSquidGameParticipant(@Request() req): Promise<ResponseVo<any>> {
    try {
      const participant = await this.campaignService.getSquidGameParticipant(
        req.user.userId,
      );
      return {
        statusCode: HttpStatus.OK,
        data: participant, // if null means not in participants
        message: 'Get participant success',
      };
    } catch (error) {
      this.logger.error(error);
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        data: {},
        message: 'Failed to get participant',
      };
    }
  }

  @Secure(null, UserRole.USER)
  @Get('squid-game-data')
  async getSquidGameData(): Promise<ResponseVo<any>> {
    try {
      const data = await this.campaignService.getSquidGameData();
      return {
        statusCode: HttpStatus.OK,
        data: data,
        message: 'Get participant success',
      };
    } catch (error) {
      this.logger.error(error);
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        data: {},
        message: 'Failed to get participant',
      };
    }
  }

  @Secure(null, UserRole.USER)
  @Get('get-user-squid-game-stage-2-ticket')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OK',
    type: ResponseVo,
  })
  async getUserSquidGameStage2Ticket(
    @Request() req,
    // i.e. page 2 limit 10, it will return data from 11 to 20, default to page 1 limit 10
    @Query('page') page: number,
    @Query('limit') limit: number,
  ): Promise<ResponseVo<any>> {
    try {
      const data = await this.campaignService.getUserSquidGameStage2Ticket(
        req.user.userId,
        page ?? 1,
        limit ?? 10,
      );
      return {
        statusCode: HttpStatus.OK,
        data: data,
        message: 'get user squid game stage 2 ticket success',
      };
    } catch (error) {
      this.logger.error(error);
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        data: null,
        message: 'get user squid game stage 2 ticket failed',
      };
    }
  }

  @Secure(null, UserRole.USER)
  @Get('get-user-squid-game-revival-data')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OK',
    type: ResponseVo,
  })
  async getUserSquidGameRevivalData(@Request() req): Promise<ResponseVo<any>> {
    try {
      const data =
        await this.campaignService.getSquidGameParticipantRevivalData(
          req.user.userId,
        );
      return {
        statusCode: HttpStatus.OK,
        data: data,
        message: 'get user squid game revival data success',
      };
    } catch (error) {
      this.logger.error(error);
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        data: null,
        message: 'get user squid game revival data failed',
      };
    }
  }
}
