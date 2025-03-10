import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Render,
  Request,
} from '@nestjs/common';
import { BackOfficeService } from './back-office.service';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { ConfigService } from 'src/config/config.service';
import { SecureEJS } from 'src/shared/decorators/secure.decorator';
import { UserRole } from 'src/shared/enum/role.enum';
import { PermissionEnum } from 'src/shared/enum/permission.enum';
import { CampaignService } from 'src/campaign/campaign.service';
import { CreditService } from 'src/wallet/services/credit.service';
import { PointService } from 'src/point/point.service';
import { ClaimApproach } from 'src/shared/enum/campaign.enum';
import { UserMessageDto } from 'src/shared/dto/admin-notification.dto';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';

@ApiTags('back-office')
@Controller('back-office')
export class BackOfficeController {
  constructor(
    private backOfficeService: BackOfficeService,
    private configService: ConfigService,
    private campaignService: CampaignService,
    private creditService: CreditService,
    private pointService: PointService,
    private adminNotificationService: AdminNotificationService,
  ) {}

  @Get('admin-login')
  @ApiExcludeEndpoint()
  @Render('admin-login')
  async adminLogin() {
    return {
      data: {},
    };
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Get('users')
  @ApiExcludeEndpoint()
  @Render('user-listing')
  async users(
    @Request() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    if (req.user.adminType === 'M') {
      throw new BadRequestException('You are not authorized to view this page');
    }
    const data = await this.backOfficeService.getUsers(page, limit);
    return {
      data: {
        users: data.data,
        user: req.user,
        currentPage: data.currentPage,
        totalPages: data.totalPages,
      },
    };
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Get('wallets')
  @ApiExcludeEndpoint()
  @Render('wallet-listing')
  async wallets(
    @Request() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    if (req.user.adminType === 'M') {
      throw new BadRequestException('You are not authorized to view this page');
    }
    const data = await this.backOfficeService.getWallets(page, limit);
    return {
      data: {
        user: req.user,
        wallets: data.data,
        currentPage: data.currentPage,
        totalPages: data.totalPages,
      },
    };
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Get('staffs')
  @ApiExcludeEndpoint()
  @Render('staff-listing')
  async staffs(
    @Request() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    if (req.user.adminType !== 'S') {
      throw new BadRequestException('You are not authorized to view this page');
    }
    const data = await this.backOfficeService.getStaffs(page, limit);
    return {
      data: {
        staffs: data.data,
        user: req.user,
        currentPage: data.currentPage,
        totalPages: data.totalPages,
      },
    };
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Get('campaigns')
  @ApiExcludeEndpoint()
  @Render('campaign-listing')
  async campaigns(@Request() req, @Query('page') page: number) {
    if (req.user.adminType === 'M') {
      throw new BadRequestException('You are not authorized to view this page');
    }
    const data = await this.campaignService.findAll(page);
    return {
      data: {
        user: req.user,
        campaigns: data.data,
        currentPage: data.currentPage,
        totalPages: data.totalPages,
      },
    };
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Get('points')
  @ApiExcludeEndpoint()
  @Render('point-listing')
  async points(@Request() req, @Query('page') page: number) {
    if (req.user.adminType === 'M') {
      throw new BadRequestException('You are not authorized to view this page');
    }
    const data = await this.backOfficeService.getUserPoints(page);
    return {
      data: {
        user: req.user,
        points: data.data,
        currentPage: data.currentPage,
        totalPages: data.totalPages,
      },
    };
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Get('messages')
  @ApiExcludeEndpoint()
  @Render('admin-message')
  async message(@Request() req) {
    return {
      data: {
        user: req.user,
      },
    };
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Post('messages')
  @ApiExcludeEndpoint()
  async sendMessage(@Request() req, @Body() payload: UserMessageDto) {
    try {
      const result =
        await this.adminNotificationService.sendUserMessage(payload);

      if (result.isError) throw new BadRequestException(result.message);
      return {
        message: result.message,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Get('pending-withdraw')
  @ApiExcludeEndpoint()
  @Render('pending-withdraw')
  async pendingWithdraw(
    @Request() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    if (req.user.adminType === 'M') {
      throw new BadRequestException('You are not authorized to view this page');
    }
    const data = await this.backOfficeService.getPendingWithdraw(page, limit);
    return {
      data: {
        user: req.user,
        transactions: data.data,
        currentPage: data.currentPage,
        totalPages: data.totalPages,
      },
    };
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Get('pending-deposit')
  @ApiExcludeEndpoint()
  @Render('pending-deposits')
  async pendingDeposits(
    @Request() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    if (req.user.adminType === 'M') {
      throw new BadRequestException('You are not authorized to view this page');
    }
    const data = await this.backOfficeService.getPendingDeposits(page, limit);
    return {
      data: {
        user: req.user,
        transactions: data.data,
        currentPage: data.currentPage,
        totalPages: data.totalPages,
      },
    };
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Get('transactions')
  @ApiExcludeEndpoint()
  @Render('transactions')
  async transactions(
    @Request() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    if (req.user.adminType === 'M') {
      throw new BadRequestException('You are not authorized to view this page');
    }
    const data = await this.backOfficeService.getTransactions(page, limit);
    return {
      data: {
        user: req.user,
        transactions: data.data,
        currentPage: data.currentPage,
        totalPages: data.totalPages,
      },
    };
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Get('past-draw-results')
  @ApiExcludeEndpoint()
  @Render('past-draw-results')
  async pastDrawResults(
    @Request() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    if (req.user.adminType === 'M') {
      throw new BadRequestException('You are not authorized to view this page');
    }
    // if (!page) page = 1;
    // if (!limit) limit = 10;
    const data = await this.backOfficeService.getPastDrawResults(page, limit);
    // console.log({
    //   data: {
    //     pastDrawResults: data.data,
    //     currentPage: data.currentPage,
    //     totalPages: data.totalPages,
    //   },
    // });
    return {
      data: {
        user: req.user,
        pastDrawResults: data.data,
        currentPage: data.currentPage,
        totalPages: data.totalPages,
      },
    };
  }

  @SecureEJS(PermissionEnum.GET_ADMIN, UserRole.ADMIN)
  @Get('create-admin')
  @ApiExcludeEndpoint()
  @Render('create-admin')
  async createAdmin(@Request() req) {
    if (req.user.adminType !== 'S') {
      throw new BadRequestException('You are not authorized to view this page');
    }
    return {
      data: {
        user: req.user,
      },
    };
  }

  @SecureEJS(PermissionEnum.UPDATE_SITE_SETTING, UserRole.ADMIN)
  @Get('create-campaign')
  @ApiExcludeEndpoint()
  @Render('create-campaign')
  async createCampaign(@Request() req) {
    if (req.user.adminType === 'M') {
      throw new BadRequestException('You are not authorized to view this page');
    }

    return {
      data: {
        user: req.user,
        claimApproaches: Object.values(ClaimApproach),
      },
    };
  }

  @Get('not-found')
  @ApiExcludeEndpoint()
  @Render('error-404')
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async error404() {
    return {
      data: {
        appUrl: this.configService.get('APP_FRONTEND_URL'),
      },
    };
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Get('referralListing')
  async referralListing(@Request() req) {
    if (req.user.adminType === 'M') {
      throw new BadRequestException('You are not authorized to view this page');
    }
    const result = await this.backOfficeService.getReferralListing();
    return {
      data: {
        user: req.user,
        referrals: result.data,
        currentPage: result.currentPage,
        totalPages: result.totalPages,
      },
    };
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Get('betListing')
  async betListing(
    @Request() req,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    if (req.user.adminType === 'M') {
      throw new BadRequestException('You are not authorized to view this page');
    }
    const result = await this.backOfficeService.bettingListing(
      new Date(startDate),
      new Date(endDate),
      page,
      limit,
    );
    return {
      data: {
        user: req.user,
        bets: result.data,
        currentPage: result.currentPage,
        totalPages: result.totalPages,
      },
    };
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Get('sales-report')
  @Render('sales-report')
  async salesReport(
    @Request() req,
    @Query('startDate') _startDate: string,
    @Query('endDate') _endDate: string,
  ) {
    if (req.user.adminType === 'M') {
      throw new BadRequestException('You are not authorized to view this page');
    }
    const result = await this.backOfficeService.salesReport(
      _startDate + ' 00:00:00',
      _endDate + ' 23:59:59',
    );
    return {
      data: {
        user: req.user,
        bets: result.data,
      },
    };
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Get('sales-report-epoch')
  @Render('sales-report-epoch')
  async salesReportByEpoch(@Request() req, @Query('epoch') epoch: number) {
    if (req.user.adminType === 'M') {
      throw new BadRequestException('You are not authorized to view this page');
    }
    const result = await this.backOfficeService.salesReportByEpoch(epoch);
    return {
      data: {
        user: req.user,
        currentEpoch: result.currentEpoch,
        bets: result.data,
      },
    };
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Get('credit-txns-listing')
  @Render('credit-txns-listing')
  async creditTxns(
    @Request() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    if (req.user.adminType === 'M') {
      throw new BadRequestException('You are not authorized to view this page');
    }
    const { data, currentPage, total } =
      await this.creditService.getAllCreditWalletTxList(page, limit);
    return {
      data: {
        user: req.user,
        transactions: data,
        currentPage: currentPage,
        totalPages: total,
      },
    };
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Get('pa')
  @ApiExcludeEndpoint()
  @Render('pa')
  async getCurrentPrizeAlgo(@Request() req) {
    if (req.user.adminType === 'M') {
      throw new BadRequestException('You are not authorized to view this page');
    }
    const res = await this.backOfficeService.getCurrentPrizeAlgo();
    return {
      data: {
        user: req.user,
        currentPa: {
          ce: res.currentEpoch,

          mtp: this.getValue(res.data, 'maxTicketPriority'),
          mtfpc: this.getValue(res.data, 'maxTicketFirstPrizeCount'),
          mtspc: this.getValue(res.data, 'maxTicketSecondPrizeCount'),
          mttpc: this.getValue(res.data, 'maxTicketThirdPrizeCount'),
          mtsppc: this.getValue(res.data, 'maxTicketSpecialPrizeCount'),
          mtcpc: this.getValue(res.data, 'maxTicketConsolationPrizeCount'),
          mtse: this.getValue(res.data, 'maxTicketStartEpoch'),
          mtee: this.getValue(res.data, 'maxTicketEndEpoch'),

          lfp: this.getValue(res.data, 'leastFirstPriority'),
          lfrl: this.getValue(res.data, 'leastFirstRandomLevel'),
          lfse: this.getValue(res.data, 'leastFirstStartEpoch'),
          lfee: this.getValue(res.data, 'leastFirstEndEpoch'),

          fnp: this.getValue(res.data, 'fixedNumberPriority'),
          fnnp: this.getValue(res.data, 'fixedNumberNumberPair'),
          fni: this.getValue(res.data, 'fixedNumberIndex'),
          fnse: this.getValue(res.data, 'fixedNumberStartEpoch'),
          fnee: this.getValue(res.data, 'fixedNumberEndEpoch'),

          app: this.getValue(res.data, 'allowPrizePriority'),
          afp:
            this.getValue(res.data, 'allowFirstPrize') === '1' ? true : false,
          asp:
            this.getValue(res.data, 'allowSecondPrize') === '1' ? true : false,
          atp:
            this.getValue(res.data, 'allowThirdPrize') === '1' ? true : false,
          aspp:
            this.getValue(res.data, 'allowSpecialPrize') === '1' ? true : false,
          asppc: this.getValue(res.data, 'allowSpecialPrizeCount'),
          acp:
            this.getValue(res.data, 'allowConsolationPrize') === '1'
              ? true
              : false,
          acpc: this.getValue(res.data, 'allowConsolationPrizeCount'),
          apse: this.getValue(res.data, 'allowPrizeStartEpoch'),
          apee: this.getValue(res.data, 'allowPrizeEndEpoch'),
        },
      },
    };
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Post('update-pa')
  @ApiExcludeEndpoint()
  @Render('pa')
  async updatePrizeAlgo(@Request() req, @Body() payload) {
    if (req.user.adminType === 'M') {
      throw new BadRequestException('You are not authorized to view this page');
    }
    const onlyNumber = (name: string, value: any): number => {
      if (isNaN(Number(value)))
        throw new BadRequestException(`${name} must be a number`);
      if (
        name === 'fixedNumberIndex' &&
        (Number(value) < 0 || Number(value) > 32)
      )
        throw new BadRequestException(
          'fixedNumberIndex must be between 0 and 32',
        );
      return Number(value);
    };

    const only123 = (value: any): number => {
      if (!value)
        throw new BadRequestException('leastFirstRandomLevel is required');
      if (value !== '1' && value !== '2' && value !== '3')
        throw new BadRequestException(
          'leastFirstRandomLevel must be 1, 2, or 3',
        );
      return Number(value);
    };

    const onlyNumberPair = (value: any): string => {
      if (!value)
        throw new BadRequestException('fixedNumberNumberPair is required');
      if (value.length !== 4)
        throw new BadRequestException(
          'fixedNumberNumberPair must has 4 digits',
        );
      if (isNaN(Number(value)))
        throw new BadRequestException(
          'fixedNumberNumberPair must be 4 digits number',
        );
      return value;
    };

    const onlyBoolean = (name: string, value: any): boolean => {
      if (value === 'true') return true;
      else if (value === 'false') return false;
      else throw new BadRequestException(`${name} must be true or false`);
    };

    const maxTicketPriority = payload.mtp
      ? onlyNumber('maxTicketPriority', payload.mtp)
      : null;
    const maxTicketFirstPrizeCount = payload.mtfpc
      ? onlyNumber('maxTicketFirstPrizeCount', payload.mtfpc)
      : null;
    const maxTicketSecondPrizeCount = payload.mtspc
      ? onlyNumber('maxTicketSecondPrizeCount', payload.mtspc)
      : null;
    const maxTicketThirdPrizeCount = payload.mttpc
      ? onlyNumber('maxTicketThirdPrizeCount', payload.mttpc)
      : null;
    const maxTicketSpecialPrizeCount = payload.mtsppc
      ? onlyNumber('maxTicketSpecialPrizeCount', payload.mtsppc)
      : null;
    const maxTicketConsolationPrizeCount = payload.mtcpc
      ? onlyNumber('maxTicketConsolationPrizeCount', payload.mtcpc)
      : null;
    const maxTicketStartEpoch = payload.mtse
      ? onlyNumber('maxTicketStartEpoch', payload.mtse)
      : null;
    const maxTicketEndEpoch = payload.mtee
      ? onlyNumber('maxTicketEndEpoch', payload.mtee)
      : null;

    const leastFirstPriority = payload.lfp
      ? onlyNumber('leastFirstPriority', payload.lfp)
      : null;
    const leastFirstRandomLevel = only123(payload.lfrl) as 1 | 2 | 3;
    const leastFirstStartEpoch = payload.lfse
      ? onlyNumber('leastFirstStartEpoch', payload.lfse)
      : null;
    const leastFirstEndEpoch = payload.lfee
      ? onlyNumber('leastFirstEndEpoch', payload.lfee)
      : null;

    const fixedNumberPriority = payload.fnp
      ? onlyNumber('fixedNumberPriority', payload.fnp)
      : null;
    const fixedNumberNumberPair = payload.fnnp
      ? onlyNumberPair(payload.fnnp)
      : null;
    const fixedNumberIndex = payload.fni
      ? onlyNumber('fixedNumberIndex', payload.fni)
      : null;
    const fixedNumberStartEpoch = payload.fnse
      ? onlyNumber('fixedNumberStartEpoch', payload.fnse)
      : null;
    const fixedNumberEndEpoch = payload.fnee
      ? onlyNumber('fixedNumberEndEpoch', payload.fnee)
      : null;

    const allowPrizePriority = payload.app
      ? onlyNumber('allowPrizePriority', payload.app)
      : null;
    const allowFirstPrize = onlyBoolean('allowFirstPrize', payload.afp);
    const allowSecondPrize = onlyBoolean('allowSecondPrize', payload.asp);
    const allowThirdPrize = onlyBoolean('allowThirdPrize', payload.atp);
    const allowSpecialPrize = onlyBoolean('allowSpecialPrize', payload.aspp);
    const allowSpecialPrizeCount = payload.asppc
      ? onlyNumber('allowSpecialPrizeCount', payload.asppc)
      : null;
    const allowConsolationPrize = onlyBoolean(
      'allowConsolationPrize',
      payload.acp,
    );
    const allowConsolationPrizeCount = payload.acpc
      ? onlyNumber('allowConsolationPrizeCount', payload.acpc)
      : null;
    const allowPrizeStartEpoch = payload.apse
      ? onlyNumber('allowPrizeStartEpoch', payload.apse)
      : null;
    const allowPrizeEndEpoch = payload.apee
      ? onlyNumber('allowPrizeEndEpoch', payload.apee)
      : null;

    const prizeAlgo = [
      { key: 'maxTicketPriority', value: maxTicketPriority },
      { key: 'maxTicketFirstPrizeCount', value: maxTicketFirstPrizeCount },
      { key: 'maxTicketSecondPrizeCount', value: maxTicketSecondPrizeCount },
      { key: 'maxTicketThirdPrizeCount', value: maxTicketThirdPrizeCount },
      { key: 'maxTicketSpecialPrizeCount', value: maxTicketSpecialPrizeCount },
      {
        key: 'maxTicketConsolationPrizeCount',
        value: maxTicketConsolationPrizeCount,
      },
      { key: 'maxTicketStartEpoch', value: maxTicketStartEpoch },
      { key: 'maxTicketEndEpoch', value: maxTicketEndEpoch },

      { key: 'leastFirstPriority', value: leastFirstPriority },
      { key: 'leastFirstRandomLevel', value: leastFirstRandomLevel },
      { key: 'leastFirstStartEpoch', value: leastFirstStartEpoch },
      { key: 'leastFirstEndEpoch', value: leastFirstEndEpoch },

      { key: 'fixedNumberPriority', value: fixedNumberPriority },
      { key: 'fixedNumberNumberPair', value: fixedNumberNumberPair },
      { key: 'fixedNumberIndex', value: fixedNumberIndex },
      { key: 'fixedNumberStartEpoch', value: fixedNumberStartEpoch },
      { key: 'fixedNumberEndEpoch', value: fixedNumberEndEpoch },

      { key: 'allowPrizePriority', value: allowPrizePriority },
      { key: 'allowFirstPrize', value: allowFirstPrize },
      { key: 'allowSecondPrize', value: allowSecondPrize },
      { key: 'allowThirdPrize', value: allowThirdPrize },
      { key: 'allowSpecialPrize', value: allowSpecialPrize },
      { key: 'allowSpecialPrizeCount', value: allowSpecialPrizeCount },
      { key: 'allowConsolationPrize', value: allowConsolationPrize },
      { key: 'allowConsolationPrizeCount', value: allowConsolationPrizeCount },
      { key: 'allowPrizeStartEpoch', value: allowPrizeStartEpoch },
      { key: 'allowPrizeEndEpoch', value: allowPrizeEndEpoch },
    ];

    const adminId = req.user.userId;
    await this.backOfficeService.updatePrizeAlgo(adminId, prizeAlgo);

    const res = await this.backOfficeService.getCurrentPrizeAlgo();
    return {
      data: {
        user: req.user,
        status: 'updated successfully',
        currentPa: {
          ce: res.currentEpoch,

          mtp: this.getValue(res.data, 'maxTicketPriority'),
          mtfpc: this.getValue(res.data, 'maxTicketFirstPrizeCount'),
          mtspc: this.getValue(res.data, 'maxTicketSecondPrizeCount'),
          mttpc: this.getValue(res.data, 'maxTicketThirdPrizeCount'),
          mtsppc: this.getValue(res.data, 'maxTicketSpecialPrizeCount'),
          mtcpc: this.getValue(res.data, 'maxTicketConsolationPrizeCount'),
          mtse: this.getValue(res.data, 'maxTicketStartEpoch'),
          mtee: this.getValue(res.data, 'maxTicketEndEpoch'),

          lfp: this.getValue(res.data, 'leastFirstPriority'),
          lfrl: this.getValue(res.data, 'leastFirstRandomLevel'),
          lfse: this.getValue(res.data, 'leastFirstStartEpoch'),
          lfee: this.getValue(res.data, 'leastFirstEndEpoch'),

          fnp: this.getValue(res.data, 'fixedNumberPriority'),
          fnnp: this.getValue(res.data, 'fixedNumberNumberPair'),
          fni: this.getValue(res.data, 'fixedNumberIndex'),
          fnse: this.getValue(res.data, 'fixedNumberStartEpoch'),
          fnee: this.getValue(res.data, 'fixedNumberEndEpoch'),

          app: this.getValue(res.data, 'allowPrizePriority'),
          afp:
            this.getValue(res.data, 'allowFirstPrize') === '1' ? true : false,
          asp:
            this.getValue(res.data, 'allowSecondPrize') === '1' ? true : false,
          atp:
            this.getValue(res.data, 'allowThirdPrize') === '1' ? true : false,
          aspp:
            this.getValue(res.data, 'allowSpecialPrize') === '1' ? true : false,
          asppc: this.getValue(res.data, 'allowSpecialPrizeCount'),
          acp:
            this.getValue(res.data, 'allowConsolationPrize') === '1'
              ? true
              : false,
          acpc: this.getValue(res.data, 'allowConsolationPrizeCount'),
          apse: this.getValue(res.data, 'allowPrizeStartEpoch'),
          apee: this.getValue(res.data, 'allowPrizeEndEpoch'),
        },
      },
    };
  }

  private getValue(data: Array<any>, key: string): any {
    for (const item of data) {
      if (item.key === key) return item.value;
    }
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Get('add-credit')
  @Render('add-credit')
  async addCredit(@Request() req) {
    if (req.user.adminType === 'M') {
      throw new BadRequestException('You are not authorized to view this page');
    }
    try {
      const campaigns = await this.campaignService.findActiveCampaigns();
      return {
        data: {
          user: req.user,
          campaigns,
        },
      };
    } catch (error) {
      return {
        data: {
          user: req.user,
          campaigns: [],
        },
      };
    }
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Get('set-referral-prize-bonus')
  @Render('set-referral-prize-bonus')
  async setReferralPrizeBonus(@Request() req) {
    if (req.user.adminType === 'M') {
      throw new BadRequestException('You are not authorized to view this page');
    }
    const data = await this.pointService.getAllReferralPrizeBonus();
    return {
      data: {
        user: req.user,
        ...data,
      },
    };
  }
}
