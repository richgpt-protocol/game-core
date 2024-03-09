import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Req,
  Request,
} from '@nestjs/common';
import { ApiHeader, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Secure } from 'src/shared/decorators/secure.decorator';
import { UserRole } from 'src/shared/enum/role.enum';
import { ResponseVo } from 'src/shared/vo/response.vo';
import { WalletService } from './wallet.service';
import { GameService } from 'src/game/game.service';
import { ClaimDto } from './dto/claim.dto';
// import { SendMessageDto } from './dto/bet.dto';

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
    const { ...userInfo } = await this.walletService.getWalletInfo(
      req.user.userId,
    );
    return {
      statusCode: HttpStatus.OK,
      data: userInfo,
      message: '',
    };
  }

  // @Secure(null, UserRole.USER)
  // @Post('claim')
  // async claim(
  //   @Body() payload: ClaimDto,
  //   @Req() req: any,
  // ): Promise<ResponseVo<any>> {
  //   try {
  //     await this.claimService.claim(Number(req.user.userId), payload);
  //     return {
  //       statusCode: HttpStatus.OK,
  //       data: null,
  //       message: 'claim success',
  //     };
  //   } catch (error) {
  //     return {
  //       statusCode: HttpStatus.BAD_REQUEST,
  //       data: null,
  //       message: error.message,
  //     };
  //   }
  // }

  // TODO
  @Secure(null, UserRole.USER)
  @Get('get-redeem-status')
  async getRedeemStatus() {}

  // TODO, need finalize and update smart contract first
  @Secure(null, UserRole.USER)
  @Post('get-xp')
  async getXP() {}
}
