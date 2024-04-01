import { Controller, Get, Render } from '@nestjs/common';
import { BackOfficeService } from './back-office.service';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { ConfigService } from 'src/config/config.service';
import { Secure } from 'src/shared/decorators/secure.decorator';
import { UserRole } from 'src/shared/enum/role.enum';
import { PermissionEnum } from 'src/shared/enum/permission.enum';

@Controller('back-office')
export class BackOfficeController {
  constructor(
    private backOfficeService: BackOfficeService,
    private configService: ConfigService,
  ) {}

  //   @Secure(null, UserRole.ADMIN)
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

  //   @Secure(null, UserRole.ADMIN)
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

  //   @Secure(null, UserRole.ADMIN)
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

  //   @Secure(null, UserRole.ADMIN)
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

//   @Secure(PermissionEnum.GET_ADMIN, UserRole.ADMIN)
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
}
