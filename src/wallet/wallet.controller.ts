import {
    BadRequestException,
    Body,
    Controller,
    Get,
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
import { WalletService } from './wallet.service';
import { GameService } from 'src/game/game.service';
// import { SendMessageDto } from './dto/bet.dto';
import { User } from 'src/user/entities/user.entity';
import { Repository } from 'typeorm';
import { BetDto } from 'src/bet/dto/bet.dto';

@ApiTags('Wallet')
@Controller('api/v1/wallet')
export class WalletController {
  constructor(
    private walletService: WalletService,
    private gameService: GameService,
  ) {}

  // TODO
  @Secure(null, UserRole.USER)
  @Post('deposit')
  async deposit() {}

  // TODO: transfer GameUSD to other wallet that registered with us, update balance in database
  @Secure(null, UserRole.USER)
  @Post('transfer')
  async transfer() {}

  // TODO: supply free credit to wallet. Here is not a good place for this API.
  @Secure(null, UserRole.ADMIN)
  @Post('supply-credit')
  async supplyCredit() {}

  @Secure(null, UserRole.USER)
  @Get('get-info')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OK',
    type: ResponseVo,
  })
  async getWalletInfo(
    @Request() req,
    // @IpAddress() ipAddress,
    // @HandlerClass() classInfo: IHandlerClass,
    // @I18n() i18n: I18nContext,
  ): Promise<ResponseVo<any>> {
    const {id, ...userInfo} = await this.walletService.getWalletInfo(req.user.userId)
    return {
      statusCode: HttpStatus.OK,
      data: userInfo,
      message: '',
    };
  }

  // TODO
  @Secure(null, UserRole.USER)
  @Get('get-redeem-status')
  async getRedeemStatus() {}

  // TODO, need finalize and update smart contract first
  @Secure(null, UserRole.USER)
  @Post('get-xp')
  async getXP() {}
}
