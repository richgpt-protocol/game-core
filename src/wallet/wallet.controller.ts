import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Query,
  Req,
  Request,
} from '@nestjs/common';
import { ApiHeader, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Secure } from 'src/shared/decorators/secure.decorator';
import { UserRole } from 'src/shared/enum/role.enum';
import { ErrorResponseVo, ResponseVo } from 'src/shared/vo/response.vo';
import { WalletService } from './wallet.service';
import { ClaimService } from './services/claim.service';
import { RedeemService } from './services/redeem.service';
import { RedeemDto } from 'src/wallet/dto/redeem.dto';
import { ReviewRedeemDto } from './dto/ReviewRedeem.dto';
import { CalculateLevelDto } from './dto/calculateLevel.dto';
import { BetOrder } from 'src/game/entities/bet-order.entity';

@ApiTags('Wallet')
@Controller('api/v1/wallet')
export class WalletController {
  constructor(
    private walletService: WalletService,
    private redeemService: RedeemService,
    private claimService: ClaimService,
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
    const { privateKey, ...userInfo } = await this.walletService.getWalletInfo(
      req.user.userId,
    );
    return {
      statusCode: HttpStatus.OK,
      data: userInfo,
      message: '',
    };
  }

  @Secure(null, UserRole.USER)
  @Post('claim')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Claim Successful.',
    type: ResponseVo,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Bad Request',
    type: ErrorResponseVo,
  })
  async claim(
    @Req() req: any,
  ): Promise<ResponseVo<any>> {
    try {
      const res = await this.claimService.claim(Number(req.user.userId));
      if (!res.error || res.data) {
        return {
          statusCode: HttpStatus.OK,
          data: res.data,
          message: 'claim success',
        };

      } else {
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          data: null,
          message: res.error,
        };
      }
    
    } catch (error) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        message: error.message,
      };
    }
  }

  @Secure(null, UserRole.USER)
  @Post('request-redeem')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Request Redeem Successful.',
    type: ResponseVo,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Bad Request',
    type: ErrorResponseVo,
  })
  async requestRedeem(
    @Req() req: any,
    @Body() payload: RedeemDto,
  ): Promise<ResponseVo<any>> {
    try {
      const res = await this.redeemService.requestRedeem(
        Number(req.user.userId),
        payload
      );
      if (!res.error || res.data) {
        return {
          statusCode: HttpStatus.OK,
          data: res.data,
          message: 'request redeem success',
        };

      } else {
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          data: null,
          message: res.error,
        };
      }
    
    } catch (error) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        message: error.message,
      };
    }
  }

  @Secure(null, UserRole.ADMIN)
  @Post('review-redeem')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Review Redeem Successful.',
    type: ResponseVo,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Bad Request',
    type: ErrorResponseVo,
  })
  async reviewRedeem(
    @Req() req: any,
    @Body() payload: ReviewRedeemDto,
  ): Promise<ResponseVo<any>> {
    try {
      const res = await this.redeemService.reviewRedeem(
        Number(req.user.userId),
        payload
      );
      if (!res.error || res.data) {
        return {
          statusCode: HttpStatus.OK,
          data: res.data,
          message: 'review redeem success',
        };

      } else {
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          data: null,
          message: res.error,
        };
      }
    
    } catch (error) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        message: error.message,
      };
    }
  }

  // TODO
  @Secure(null, UserRole.USER)
  @Get('get-redeem-status')
  async getRedeemStatus() {}

  // TODO, need finalize and update smart contract first
  @Secure(null, UserRole.USER)
  @Post('get-xp')
  async getXP() {}

  @Secure(null, UserRole.USER)
  @Get('calculate-level')
  calculateLevel(@Query() payload: CalculateLevelDto): ResponseVo<any> {
    const level = this.walletService.calculateLevel(payload.point);
    return {
      statusCode: HttpStatus.BAD_REQUEST,
      data: { level },
      message: '',
    };
  }

  @Secure(null, UserRole.USER)
  @Get('get-wallet-tx')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OK',
    type: ResponseVo,
  })
  async getWalletTx(
    @Request() req,
    // @IpAddress() ipAddress,
    // @HandlerClass() classInfo: IHandlerClass,
    // @I18n() i18n: I18nContext,
    @Query('count') count: number,
  ): Promise<ResponseVo<any>> {
    const walletTxs = await this.walletService.getWalletTx(
      req.user.userId,
      count
    );
    return {
      statusCode: HttpStatus.OK,
      data: walletTxs,
      message: '',
    };
  }

  @Secure(null, UserRole.USER)
  @Get('get-user-ticket')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OK',
    type: ResponseVo,
  })
  async getTicket(
    @Request() req,
    // @IpAddress() ipAddress,
    // @HandlerClass() classInfo: IHandlerClass,
    // @I18n() i18n: I18nContext,
  ): Promise<ResponseVo<any>> {
    const betWalletTxs = await this.walletService.getTicket(
      req.user.userId,
    );

    // final result after code below
    // {
    //   claimableAmount: 200, // total claimable amount
    //   tickets: [
    //     id: 1, // ticket id (walletTx id)
    //     draws: [
    //       {
    //         id: 1, // draw id (game id)
    //         betOrders: [
    //           numberPair: "4896",
    //           bigForecastAmount: 1,
    //           smallForecastAmount: 0.5,
    //           isClaimable: true
    //         ],
    //       }
    //     ]
    //   ]
    // }

    // naive way to get final result
    const tickets = await Promise.all(
      betWalletTxs.map(async (walletTx) => {
        const draws = [];
        const gameIds = [];
        walletTx.betOrders.forEach((betOrder) => {
          if (!gameIds.includes(betOrder.gameId)) gameIds.push(betOrder.gameId);
        });
        for (const gameId of gameIds) {
          const betOrders = walletTx.betOrders.filter(
            (betOrder) => betOrder.gameId === gameId,
          );
          const gameInfo = betOrders[0].game;
          const draw = {
            id: gameId,
            date: gameInfo.startDate,
            betOrders,
          };
          draws.push(draw);
        }
        const claimableAmountByTicket =
          await this.claimService.getPendingClaimByWalletTxId(walletTx.id);
        return {
          id: walletTx.id,
          date: walletTx.createdDate,
          draws,
          claimableAmountByTicket,
        };
      }),
    );

    const data = {
      claimableAmount: await this.claimService.getPendingClaimAmount(
        req.user.userId,
      ),
      tickets: tickets.map((ticket) => {
        return {
          id: ticket.id,
          createdDate: ticket.date,
          claimableAmountByTicket: ticket.claimableAmountByTicket,
          draws: ticket.draws.map((draw: any) => {
            return {
              id: draw.id,
              date: draw.date,
              betOrders: draw.betOrders.map((betOrder: BetOrder) => {
                const isClaimable =
                  betOrder.availableClaim === false
                    ? false
                    : betOrder.availableClaim === true &&
                        betOrder.isClaimed === true
                      ? false
                  : true;

                const isWin =
                  betOrder.isClaimed === true || betOrder.availableClaim
                    ? true
                    : false;
                return {
                  numberPair: betOrder.numberPair,
                  bigForecastAmount: betOrder.bigForecastAmount,
                  smallForecastAmount: betOrder.smallForecastAmount,
                  drawSetup: betOrder.type,
                  motherPair: betOrder.motherPair,
                  isClaimable,
                  isWin,
                }
              })
            }
          })
        }
      })
    }

    return {
      statusCode: HttpStatus.OK,
      data,
      message: '',
    };
  }

  @Secure(null, UserRole.USER)
  @Get('get-point-history')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OK',
    type: ResponseVo,
  })
  async getPointHistory(
    @Request() req,
    // @IpAddress() ipAddress,
    // @HandlerClass() classInfo: IHandlerClass,
    // @I18n() i18n: I18nContext,
    @Query('count') count: number,
  ): Promise<ResponseVo<any>> {
    const pointTxs = await this.walletService.getPointHistory(
      req.user.userId,
      count
    );
    return {
      statusCode: HttpStatus.OK,
      data: pointTxs,
      message: '',
    };
  }
}
