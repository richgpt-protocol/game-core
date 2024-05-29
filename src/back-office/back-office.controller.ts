import { Controller, Get, Query, Render } from '@nestjs/common';
import { BackOfficeService } from './back-office.service';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { ConfigService } from 'src/config/config.service';
import { Secure, SecureEJS } from 'src/shared/decorators/secure.decorator';
import { UserRole } from 'src/shared/enum/role.enum';
import { PermissionEnum } from 'src/shared/enum/permission.enum';

@ApiTags('back-office')
@Controller('back-office')
export class BackOfficeController {
  constructor(
    private backOfficeService: BackOfficeService,
    private configService: ConfigService,
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

  // @SecureEJS(null, UserRole.ADMIN)
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
  @Get('salesReport')
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
        bets: result.data
      },
    };
  }
}
