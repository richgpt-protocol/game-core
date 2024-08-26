import { Body, Controller, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PointService } from './point.service';
import { SetReferralPrizeBonusDto } from './points.dto';
import { ResponseVo } from 'src/shared/vo/response.vo';
import { SecureEJS } from 'src/shared/decorators/secure.decorator';
import { UserRole } from 'src/shared/enum/role.enum';

@ApiTags('Point')
@Controller('api/v1/point')
export class PointController {
  constructor(private pointService: PointService) {}

  @SecureEJS(null, UserRole.ADMIN)
  @Post('set-referral-prize-bonus')
  async setReferralPrizeBonus(
    @Body() body: SetReferralPrizeBonusDto,
  ): Promise<ResponseVo<any>> {
    await this.pointService.setReferralPrizeBonus(body);

    return {
      statusCode: HttpStatus.OK,
      message: 'Referral prize bonus has been set successfully',
      data: {},
    };
  }
}
