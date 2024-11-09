import { Body, Controller, Get, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PointService } from './point.service';
import { SetReferralPrizeBonusDto } from './points.dto';
import { ResponseVo } from 'src/shared/vo/response.vo';
import { Secure, SecureEJS } from 'src/shared/decorators/secure.decorator';
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

  @Secure(null, UserRole.USER)
  @Get('leaderboard-curent-week')
  async getLeaderboardCurrentWeek(
    @Query('limit') limit: number,
  ): Promise<ResponseVo<any>> {
    const leaderboard =
      await this.pointService.getCurrentWeekLeaderBoard(limit);

    return {
      statusCode: HttpStatus.OK,
      message: 'Leaderboard retrieved successfully',
      data: leaderboard,
    };
  }

  @Secure(null, UserRole.USER)
  @Get('leaderboard-all-time')
  async getLeaderboardAllTime(
    @Query('limit') limit: number,
  ): Promise<ResponseVo<any>> {
    const leaderboard = await this.pointService.getAllTimeLeaderBoard(limit);

    return {
      statusCode: HttpStatus.OK,
      message: 'Leaderboard retrieved successfully',
      data: leaderboard,
    };
  }

  @Secure(null, UserRole.USER)
  @Get('leaderboard')
  async getLeaderboard(
    @Query('limit') limit: number,
    @Query('startDate') startDate?: Date,
    @Query('endDate') endDate?: Date,
  ): Promise<ResponseVo<any>> {
    const allTimeLeaderboard =
      await this.pointService.getAllTimeLeaderBoard(limit);
    let currentWeekLeaderboard = [];

    if (startDate && endDate) {
      currentWeekLeaderboard =
        await this.pointService.getCurrentWeekLeaderBoard(
          limit,
          new Date(startDate),
          new Date(endDate),
        );
      // currentWeekLeaderboard = await this.pointService.getLeaderBoard(
      //   startDate,
      //   endDate,
      //   limit,
      // );
    } else {
      currentWeekLeaderboard =
        await this.pointService.getCurrentWeekLeaderBoard(limit);
    }

    return {
      statusCode: HttpStatus.OK,
      message: 'Leaderboard retrieved successfully',
      data: {
        allTimeLeaderboard,
        currentWeekLeaderboard,
      },
    };
  }

  @Secure(null, UserRole.USER)
  @Get('leaderboard-range')
  async getLeaderboardRange(
    @Query('limit') limit: number,
    @Query('startDate') startDate: Date,
    @Query('endDate') endDate: Date,
  ): Promise<ResponseVo<any>> {
    const leaderboard = await this.pointService.getLeaderBoard(
      startDate,
      endDate,
      limit,
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'Leaderboard retrieved successfully',
      data: leaderboard,
    };
  }
}
