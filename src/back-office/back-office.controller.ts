import { BadRequestException, Body, Controller, Get, Post, Query, Render, Request } from '@nestjs/common';
import { BackOfficeService } from './back-office.service';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { ConfigService } from 'src/config/config.service';
import { SecureEJS } from 'src/shared/decorators/secure.decorator';
import { UserRole } from 'src/shared/enum/role.enum';
import { PermissionEnum } from 'src/shared/enum/permission.enum';
import { PrizeAlgo } from 'src/game/entities/prize-algo.entity';
import { CampaignService } from 'src/campaign/campaign.service';
import { CreditService } from 'src/wallet/services/credit.service';
import { PointService } from 'src/point/point.service';

@ApiTags('back-office')
@Controller('back-office')
export class BackOfficeController {
  constructor(
    private backOfficeService: BackOfficeService,
    private configService: ConfigService,
    private campaignService: CampaignService,
    private creditService: CreditService,
    private pointService: PointService,
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
  async users() {
    const data = await this.backOfficeService.getUsers();
    return {
      data: {
        users: data.data,
        currentPage: data.currentPage,
        totalPages: data.totalPages,
      },
    };
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Get('wallets')
  @ApiExcludeEndpoint()
  @Render('wallet-listing')
  async wallets() {
    const data = await this.backOfficeService.getWallets();
    return {
      data: {
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
  async staffs() {
    const data = await this.backOfficeService.getStaffs();
    return {
      data: {
        staffs: data.data,
        currentPage: data.currentPage,
        totalPages: data.totalPages,
      },
    };
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Get('campaigns')
  @ApiExcludeEndpoint()
  @Render('campaign-listing')
  async campaigns(@Query('page') page: number) {
    const data = await this.campaignService.findAll(page);
    return {
      data: {
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
  async points(@Query('page') page: number) {
    const data = await this.backOfficeService.getUserPoints(page);
    return {
      data: {
        points: data.data,
        currentPage: data.currentPage,
        totalPages: data.totalPages,
      },
    };
  }

  @Get('pending-withdraw')
  @ApiExcludeEndpoint()
  @Render('pending-withdraw')
  async pendingWithdraw(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const data = await this.backOfficeService.getPendingWithdraw(page, limit);
    return {
      data: {
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
  async transactions() {
    const data = await this.backOfficeService.getTransactions();
    return {
      data: {
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
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    // if (!page) page = 1;
    // if (!limit) limit = 10;
    const data = await this.backOfficeService.getPastDrawResults(page, limit);
    console.log({
      data: {
        pastDrawResults: data.data,
        currentPage: data.currentPage,
        totalPages: data.totalPages,
      },
    });
    return {
      data: {
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
  async createAdmin() {
    return {
      data: {},
    };
  }

  @SecureEJS(PermissionEnum.UPDATE_SITE_SETTING, UserRole.ADMIN)
  @Get('create-campaign')
  @ApiExcludeEndpoint()
  @Render('create-campaign')
  async createCampaign() {
    return {
      data: {},
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
  async referralListing() {
    const result = await this.backOfficeService.getReferralListing();
    return {
      data: {
        referrals: result.data,
        currentPage: result.currentPage,
        totalPages: result.totalPages,
      },
    };
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Get('betListing')
  async betListing(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.backOfficeService.bettingListing(
      new Date(startDate),
      new Date(endDate),
      page,
      limit,
    );
    return {
      data: {
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
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const result = await this.backOfficeService.salesReport(
      new Date(startDate),
      new Date(endDate),
    );
    return {
      data: {
        bets: result.data,
      },
    };
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Get('credit-txns-listing')
  @Render('credit-txns-listing')
  async creditTxns(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const { data, currentPage, total } =
      await this.creditService.getAllCreditWalletTxList(page, limit);
    return {
      data: {
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
  async getCurrentPrizeAlgo() {
    const res = await this.backOfficeService.getCurrentPrizeAlgo();
    return {
      data: {
        currentPa: {
          updatedDate: res.data.updatedDate.toLocaleString(),
          updatedBy: res.data.updatedBy,
          ce: res.currentEpoch,

          mtp: res.data.maxTicketPriority,
          mtfpc: res.data.maxTicketFirstPrizeCount,
          mtspc: res.data.maxTicketSecondPrizeCount,
          mttpc: res.data.maxTicketThirdPrizeCount,
          mtsppc: res.data.maxTicketSpecialPrizeCount,
          mtcpc: res.data.maxTicketConsolationPrizeCount,
          mtse: res.data.maxTicketStartEpoch,
          mtee: res.data.maxTicketEndEpoch,

          lfp: res.data.leastFirstPriority,
          lfrl: res.data.leastFirstRandomLevel,
          lfse: res.data.leastFirstStartEpoch,
          lfee: res.data.leastFirstEndEpoch,

          fnp: res.data.fixedNumberPriority,
          fnnp: res.data.fixedNumberNumberPair,
          fni: res.data.fixedNumberIndex,
          fnse: res.data.fixedNumberStartEpoch,
          fnee: res.data.fixedNumberEndEpoch,

          app: res.data.allowPrizePriority,
          afp: res.data.allowFirstPrize,
          asp: res.data.allowSecondPrize,
          atp: res.data.allowThirdPrize,
          aspp: res.data.allowSpecialPrize,
          asppc: res.data.allowSpecialPrizeCount,
          acp: res.data.allowConsolationPrize,
          acpc: res.data.allowConsolationPrizeCount,
          apse: res.data.allowPrizeStartEpoch,
          apee: res.data.allowPrizeEndEpoch,
        },
      },
    };
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Post('update-pa')
  @ApiExcludeEndpoint()
  @Render('pa')
  async updatePrizeAlgo(
    @Request() req,
    @Body() payload
  ) {
    const onlyNumber = (name: string, value: any): number => {
      if (isNaN(Number(value))) throw new BadRequestException(`${name} must be a number`);
      if (name === 'fixedNumberIndex' && Number(value) < 0 || Number(value) > 32) throw new BadRequestException('fixedNumberIndex must be between 0 and 32');
      return Number(value);
    }

    const only123 = (value: any): number => {
      if (!value) throw new BadRequestException('leastFirstRandomLevel is required');
      if (value !== '1' && value !== '2' && value !== '3') throw new BadRequestException('leastFirstRandomLevel must be 1, 2, or 3');
      return Number(value);
    }

    const onlyNumberPair = (value: any): string => {
      if (!value) throw new BadRequestException('fixedNumberNumberPair is required');
      if (value.length !== 4) throw new BadRequestException('fixedNumberNumberPair must has 4 digits');
      if (isNaN(Number(value))) throw new BadRequestException('fixedNumberNumberPair must be 4 digits number');
      return value;
    }

    const onlyBoolean = (name: string, value: any): boolean => {
      if (value === 'true') return true;
      else if (value === 'false') return false;
      else throw new BadRequestException(`${name} must be true or false`);
    }

    const prizeAlgo = new PrizeAlgo();
    prizeAlgo.updatedBy = req.user.userId; // admin id

    prizeAlgo.maxTicketPriority = payload.mtp ? onlyNumber('maxTicketPriority', payload.mtp) : null;
    prizeAlgo.maxTicketFirstPrizeCount = payload.mtfpc ? onlyNumber('maxTicketFirstPrizeCount', payload.mtfpc) : null;
    prizeAlgo.maxTicketSecondPrizeCount = payload.mtspc ? onlyNumber('maxTicketSecondPrizeCount', payload.mtspc) : null;
    prizeAlgo.maxTicketThirdPrizeCount = payload.mttpc ? onlyNumber('maxTicketThirdPrizeCount', payload.mttpc) : null;
    prizeAlgo.maxTicketSpecialPrizeCount = payload.mtsppc ? onlyNumber('maxTicketSpecialPrizeCount', payload.mtsppc) : null;
    prizeAlgo.maxTicketConsolationPrizeCount = payload.mtcpc ? onlyNumber('maxTicketConsolationPrizeCount', payload.mtcpc) : null;
    prizeAlgo.maxTicketStartEpoch = payload.mtse ? onlyNumber('maxTicketStartEpoch', payload.mtse) : null;
    prizeAlgo.maxTicketEndEpoch = payload.mtee ? onlyNumber('maxTicketEndEpoch', payload.mtee) : null;

    prizeAlgo.leastFirstPriority = payload.lfp ? onlyNumber('leastFirstPriority', payload.lfp) : null;
    prizeAlgo.leastFirstRandomLevel = only123(payload.lfrl) as 1 | 2 | 3;
    prizeAlgo.leastFirstStartEpoch = payload.lfse ? onlyNumber('leastFirstStartEpoch', payload.lfse) : null;
    prizeAlgo.leastFirstEndEpoch = payload.lfee ? onlyNumber('leastFirstEndEpoch', payload.lfee) : null;

    prizeAlgo.fixedNumberPriority = payload.fnp ? onlyNumber('fixedNumberPriority', payload.fnp) : null;
    prizeAlgo.fixedNumberNumberPair = onlyNumberPair(payload.fnnp);
    prizeAlgo.fixedNumberIndex = onlyNumber('fixedNumberIndex', payload.fni);
    prizeAlgo.fixedNumberStartEpoch = payload.fnse ? onlyNumber('fixedNumberStartEpoch', payload.fnse) : null;
    prizeAlgo.fixedNumberEndEpoch = payload.fnee ? onlyNumber('fixedNumberEndEpoch', payload.fnee) : null;

    prizeAlgo.allowPrizePriority = payload.app ? onlyNumber('allowPrizePriority', payload.app) : null;
    prizeAlgo.allowFirstPrize = onlyBoolean('allowFirstPrize', payload.afp);
    prizeAlgo.allowSecondPrize = onlyBoolean('allowSecondPrize', payload.asp);
    prizeAlgo.allowThirdPrize = onlyBoolean('allowThirdPrize', payload.atp);
    prizeAlgo.allowSpecialPrize = onlyBoolean('allowSpecialPrize', payload.aspp);
    prizeAlgo.allowSpecialPrizeCount = payload.asppc ? onlyNumber('allowSpecialPrizeCount', payload.asppc) : null;
    prizeAlgo.allowConsolationPrize = onlyBoolean('allowConsolationPrize', payload.acp);
    prizeAlgo.allowConsolationPrizeCount = payload.acpc ? onlyNumber('allowConsolationPrizeCount', payload.acpc) : null;
    prizeAlgo.allowPrizeStartEpoch = payload.apse ? onlyNumber('allowPrizeStartEpoch', payload.apse) : null;
    prizeAlgo.allowPrizeEndEpoch = payload.apee ? onlyNumber('allowPrizeEndEpoch', payload.apee) : null;

    await this.backOfficeService.updatePrizeAlgo(prizeAlgo);

    const res = await this.backOfficeService.getCurrentPrizeAlgo();
    return {
      data: {
        currentPa: {
          updatedDate: res.data.updatedDate.toLocaleString(),
          updatedBy: res.data.updatedBy,
          ce: res.currentEpoch,

          mtp: res.data.maxTicketPriority,
          mtfpc: res.data.maxTicketFirstPrizeCount,
          mtspc: res.data.maxTicketSecondPrizeCount,
          mttpc: res.data.maxTicketThirdPrizeCount,
          mtsppc: res.data.maxTicketSpecialPrizeCount,
          mtcpc: res.data.maxTicketConsolationPrizeCount,
          mtse: res.data.maxTicketStartEpoch,
          mtee: res.data.maxTicketEndEpoch,

          lfp: res.data.leastFirstPriority,
          lfrl: res.data.leastFirstRandomLevel,
          lfse: res.data.leastFirstStartEpoch,
          lfee: res.data.leastFirstEndEpoch,

          fnp: res.data.fixedNumberPriority,
          fnnp: res.data.fixedNumberNumberPair,
          fni: res.data.fixedNumberIndex,
          fnse: res.data.fixedNumberStartEpoch,
          fnee: res.data.fixedNumberEndEpoch,

          app: res.data.allowPrizePriority,
          afp: res.data.allowFirstPrize,
          asp: res.data.allowSecondPrize,
          atp: res.data.allowThirdPrize,
          aspp: res.data.allowSpecialPrize,
          asppc: res.data.allowSpecialPrizeCount,
          acp: res.data.allowConsolationPrize,
          acpc: res.data.allowConsolationPrizeCount,
          apse: res.data.allowPrizeStartEpoch,
          apee: res.data.allowPrizeEndEpoch,
        },
      },
    };
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Get('add-credit')
  @Render('add-credit')
  async addCredit() {
    try {
      const campaigns = await this.campaignService.findActiveCampaigns();
      return {
        data: {
          campaigns,
        },
      };
    } catch (error) {
      return {
        data: {
          campaigns: [],
        },
      };
    }
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Get('set-referral-prize-bonus')
  @Render('set-referral-prize-bonus')
  async setReferralPrizeBonus() {
    const data = await this.pointService.getAllReferralPrizeBonus();
    console.log(data);
    return {
      data,
    };
  }
}
