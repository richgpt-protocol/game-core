import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Request,
} from '@nestjs/common';
import { ApiHeader, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { I18n, I18nContext } from 'nestjs-i18n';
import { AdminService } from 'src/admin/admin.service';
import { SseService } from 'src/admin/sse/sse.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { MobileCountries } from 'src/shared/constants/mobile-country.constant';
import { HandlerClass } from 'src/shared/decorators/handler-class.decorator';
import { IpAddress } from 'src/shared/decorators/ip-address.decorator';
import { Secure } from 'src/shared/decorators/secure.decorator';
import { UserRole } from 'src/shared/enum/role.enum';
import { IHandlerClass } from 'src/shared/interfaces/handler-class.interface';
import { SMSService } from 'src/shared/services/sms.service';
import { DateUtil } from 'src/shared/utils/date.util';
import { RandomUtil } from 'src/shared/utils/random.util';
import {
  ErrorResponseVo,
  ResponseListVo,
  ResponseVo,
} from 'src/shared/vo/response.vo';
import { DepositService } from './deposit.service';
import { CreateDeopsitRequestDto, SupplyDto } from './dto/deposit.dto';
import { WalletService } from 'src/wallet/wallet.service';
import { ConfigService } from 'src/config/config.service';

@ApiTags('Deposit')
@Controller('api/v1/deposit')
export class DepositController {
  constructor(
    private depositService: DepositService,
    private walletService: WalletService,
    private configService: ConfigService,
  ) {}

  @Post('/')
  @Secure(UserRole.USER)
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Deposit request created successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Deposit request failed',
  })
  async createDepositRequest(
    @Request() req,
    @Body() body: CreateDeopsitRequestDto,
  ): Promise<ResponseVo<any>> {
    try {
      //TODO solana
      const wallet = await this.walletService.getWalletInfo(req.user.id);

      await this.depositService.createDepositRequest(req.user, {
        chainId: body.chainId,
        address: wallet.walletAddress,
      });

      return {
        statusCode: HttpStatus.OK,
        message: 'Deposit request created successfully',
        data: {},
      };
    } catch (error) {
      console.error(error);
      throw new BadRequestException('Deposit request failed');
    }
  }

  @Post('/supply')
  async supply(
    @Request() req,
    @Body() body: SupplyDto,
    @Headers('DEPOSIT_BOT_SECRET') botSecret: string,
  ): Promise<ResponseVo<any>> {
    const secret = this.configService.get('DEPOSIT_BOT_SECRET');
    if (!secret || botSecret != secret) {
      throw new BadRequestException('Invalid secret');
    }

    await this.depositService.supply(body);

    return {
      statusCode: HttpStatus.OK,
      message: 'Supply request received',
      data: null,
    };
  }
}
