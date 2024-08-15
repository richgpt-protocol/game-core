import { Body, Controller, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SecureEJS } from 'src/shared/decorators/secure.decorator';
import { PermissionEnum } from 'src/shared/enum/permission.enum';
import { UserRole } from 'src/shared/enum/role.enum';
import { CampaignService } from './campaign.service';
import { CreateCampaignDto } from './dto/campaign.dto';
import { ResponseVo } from 'src/shared/vo/response.vo';

@ApiTags('campaign')
@Controller('api/v1/campaign')
export class CampaignController {
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
}
