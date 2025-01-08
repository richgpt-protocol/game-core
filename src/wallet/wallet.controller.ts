import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  Post,
  Query,
  Req,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiHeaders,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Secure, SecureEJS } from 'src/shared/decorators/secure.decorator';
import { UserRole } from 'src/shared/enum/role.enum';
import { ErrorResponseVo, ResponseVo } from 'src/shared/vo/response.vo';
import { WalletService } from './wallet.service';
import { ClaimService } from './services/claim.service';
import { WithdrawService } from './services/withdraw.service';
import { RedeemDto } from 'src/wallet/dto/redeem.dto';
import { ReviewRedeemDto } from './dto/ReviewRedeem.dto';
import { CalculateLevelDto } from './dto/calculateLevel.dto';
import { BetOrder } from 'src/game/entities/bet-order.entity';
import { TransferGameUSDDto } from './dto/InternalTransferDto';
import { InternalTransferService } from './services/internal-transfer.service';
import { DepositDTO, ReviewDepositDto } from './dto/deposit.dto';
import { DepositService } from './services/deposit.service';
import { ConfigService } from 'src/config/config.service';
import { PermissionEnum } from 'src/shared/enum/permission.enum';
import { CreditService } from './services/credit.service';
import { AddCreditBackofficeDto } from './dto/credit.dto';
import { DataSource } from 'typeorm';

@ApiTags('Wallet')
@Controller('api/v1/wallet')
export class WalletController {
  private readonly logger = new Logger(WalletController.name);

  constructor(
    private walletService: WalletService,
    private withdrawService: WithdrawService,
    private claimService: ClaimService,
    private internalTransferService: InternalTransferService,
    private depositService: DepositService,
    private configService: ConfigService,
    private creditService: CreditService,
    private datasource: DataSource,
  ) {}

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
    const userInfo = await this.walletService.getWalletInfo(req.user.userId);
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
  async claim(@Req() req: any): Promise<ResponseVo<any>> {
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
      const res = await this.withdrawService.requestRedeem(
        Number(req.user.userId),
        payload,
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

  // @Secure(null, UserRole.ADMIN)
  @SecureEJS(PermissionEnum.PAYOUT, UserRole.ADMIN)
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
      const res = await this.withdrawService.reviewAdmin(
        Number(req.user.userId),
        payload,
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

  @Secure(null, UserRole.USER)
  @Get('get-withdrawal-fee')
  async getWithdrawlFee(
    @Query('chainId') chainId: number,
  ): Promise<ResponseVo<any>> {
    const fee = await this.withdrawService.getWithdrawalFees(chainId);

    return {
      statusCode: HttpStatus.OK,
      data: fee,
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

  @Secure(null, UserRole.USER)
  @Get('calculate-level')
  calculateLevel(@Query() payload: CalculateLevelDto): ResponseVo<any> {
    const level = this.walletService.calculateLevel(payload.point);
    return {
      statusCode: HttpStatus.OK,
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
      Number(req.user.userId),
      count,
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
    try {
      const betWalletTxs: { [key: number]: BetOrder[] } =
        await this.walletService.getBetOrders(Number(req.user.userId));
      // final result after code below
      // {
      //   claimableAmount: 200, // total claimable amount
      //   tickets: [
      //     id: 1, // ticket id (gameUsdtTx id)
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

      const tickets = await Promise.all(
        Object.entries(betWalletTxs).map(async ([gameUsdTxId, betOrders]) => {
          const draws = [];
          const { totalWinningAmount: claimableAmountByTicket, drawResults } =
            await this.claimService.getPendingClaimByGameUsdTxId(
              Number(gameUsdTxId),
            );
          const gameIds = [];
          betOrders.forEach((betOrder) => {
            if (!gameIds.includes(betOrder.gameId))
              gameIds.push(betOrder.gameId);
          });
          const drawResultsByGameId = drawResults.reduce((acc, drawResult) => {
            if (acc[drawResult.gameId]) {
              acc[drawResult.gameId].push(drawResult);
            } else {
              acc[drawResult.gameId] = [drawResult];
            }
            return acc;
          }, {});

          for (const gameId of gameIds) {
            const betOrdersInEpoch = betOrders.filter(
              (betOrder) => betOrder.gameId === gameId,
            );

            const _betOrders = betOrdersInEpoch.map((_betOrder) => {
              const draw =
                drawResultsByGameId[gameId] &&
                drawResultsByGameId[gameId].find((drawResult) => {
                  return (
                    drawResult.gameId === gameId &&
                    drawResult.numberPair === _betOrder.numberPair
                  );
                });

              return {
                ..._betOrder,
                isBigForecastWin:
                  draw && _betOrder.bigForecastAmount > 0 ? true : false,
                isSmallForecastWin:
                  draw &&
                  ['1', '2', '3'].includes(draw.prizeCategory) &&
                  _betOrder.smallForecastAmount > 0
                    ? true
                    : false,
              };
            });

            const gameInfo = _betOrders[0].game;
            const draw = {
              id: gameInfo.epoch,
              date: gameInfo.startDate,
              betOrders: _betOrders,
            };

            draws.push(draw);
          }
          return {
            id: gameUsdTxId,
            date: betOrders[0].createdDate,
            draws,
            claimableAmountByTicket,
          };
        }),
      );

      tickets.sort((a, b) => {
        return Number(b.id) - Number(a.id);
      });

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
                betOrders: draw.betOrders.map(
                  (
                    betOrder: BetOrder & {
                      isBigForecastWin: boolean;
                      isSmallForecastWin: boolean;
                    },
                  ) => {
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
                      isBigForecastWin: betOrder.isBigForecastWin,
                      isSmallForecastWin: betOrder.isSmallForecastWin,
                    };
                  },
                ),
              };
            }),
          };
        }),
      };

      return {
        statusCode: HttpStatus.OK,
        data,
        message: '',
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
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
      count,
    );
    return {
      statusCode: HttpStatus.OK,
      data: pointTxs,
      message: '',
    };
  }

  @Secure(null, UserRole.USER)
  @ApiBody({
    type: TransferGameUSDDto,
    required: true,
  })
  @Post('transfer')
  async transfer(
    @Request() req,
    @Body() payload: TransferGameUSDDto,
  ): Promise<ResponseVo<any>> {
    const userId = req.user.userId;
    // const userId = 1;
    try {
      await this.internalTransferService.transferGameUSD(userId, payload);
      return {
        statusCode: HttpStatus.OK,
        data: {},
        message: 'Transfer success',
      };
    } catch (error) {
      console.log(error);
      throw new BadRequestException(error.message);
    }
  }

  // This endpoint can only be accessed by whitelisted ip in IpWhitelistMiddleware class
  @Post('deposit')
  @ApiHeaders([
    {
      name: 'x-secret',
      description: 'Deposit bot secret',
    },
  ])
  @ApiBody({ type: DepositDTO })
  async deposit(
    @Req() req: Request,
    @Body() payload: DepositDTO,
  ): Promise<ResponseVo<any>> {
    const headerSecret = req.headers['x-secret'];
    if (headerSecret !== this.configService.get('DEPOSIT_BOT_SECRET')) {
      throw new BadRequestException('Invalid secret');
    }
    await this.depositService.processDeposit(payload);

    return {
      statusCode: HttpStatus.OK,
      data: {},
      message: 'Deposit',
    };
  }

  @Post('review-deposit')
  @SecureEJS(PermissionEnum.PAYOUT, UserRole.ADMIN)
  async reviewDeposit(@Request() req, @Body() payload: ReviewDepositDto) {
    if (req.user.adminType != 'S') {
      throw new UnauthorizedException('Only superuser can create admin.');
    }

    try {
      await this.depositService.processDepositAdmin(payload);
      return {
        statusCode: HttpStatus.OK,
        message: 'Action success',
        data: {},
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('all-wallet-addresses')
  async getAllWalletAddresses(
    @Query('page') page: number,
    @Query('limit') limit: number,
  ): Promise<ResponseVo<any>> {
    const data = await this.depositService.getAllAddress(page, limit);

    return {
      statusCode: HttpStatus.OK,
      data: data,
      message: '',
    };
  }

  @Secure(null, UserRole.USER)
  @Get('credit-balance')
  async getCreditBalance(@Request() req): Promise<ResponseVo<any>> {
    const userId = req.user.userId;
    const creditBalance = await this.creditService.getCreditBalance(userId);
    return {
      statusCode: HttpStatus.OK,
      data: { creditBalance },
      message: '',
    };
  }

  @Secure(null, UserRole.USER)
  @Get('credit-transactions')
  async getCreditTransactions(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
  ): Promise<ResponseVo<any>> {
    const userId = req.user.userId;
    const {
      data: transactions,
      currentPage,
      total: totalPages,
    } = await this.creditService.getCreditWalletTxList(userId, page, limit);
    return {
      statusCode: HttpStatus.OK,
      data: {
        transactions,
        currentPage,
        totalPages,
      },
      message: '',
    };
  }

  @SecureEJS(null, UserRole.ADMIN)
  @Post('add-credit')
  async addCredit(
    @Body() payload: AddCreditBackofficeDto,
  ): Promise<ResponseVo<any>> {
    const queryRunner = this.datasource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const { campaignId, ...restPayload } = payload;

      if (payload.gameUsdAmount > 0) {
        await this.creditService.addCreditBackoffice(
          {
            ...restPayload,
            usdtAmount: Number(payload.usdtAmount),
            gameUsdAmount: Number(payload.gameUsdAmount),
            campaignId: campaignId || null, // Handle empty campaignId
          },
          queryRunner,
        );
      }

      if (payload.usdtAmount > 0) {
        await this.walletService.addUSDT(
          payload.uid,
          payload.usdtAmount,
          queryRunner,
        );
      }

      await queryRunner.commitTransaction();

      return {
        statusCode: HttpStatus.OK,
        message: 'credit add process initiated',
        data: {},
      };
    } catch (error) {
      console.error(error);
      await queryRunner.rollbackTransaction();
      throw new InternalServerErrorException('Failed to add credit');
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  @Secure(null, UserRole.ADMIN)
  @Post('retry-credit')
  async retryCredit(@Body() payload: { creditWalletTxId: number }) {
    await this.creditService.retryCreditTx(payload.creditWalletTxId);
    return {
      statusCode: HttpStatus.OK,
      message: 'retry credit process initiated',
      data: {},
    };
  }

  @Secure(null, UserRole.ADMIN)
  @Post('retry-deposit')
  async retryDeposit(@Body() payload: { depositId: number }) {
    await this.depositService.retryDeposit(payload.depositId);
    return {
      statusCode: HttpStatus.OK,
      message: 'retry deposit process initiated',
      data: {},
    };
  }

  @Secure(null, UserRole.USER)
  @Get('get-user-jackpot-ticket')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OK',
    type: ResponseVo,
  })
  async getUserJackpotTicket(
    @Request() req,
    // i.e. page 2 limit 10, it will return data from 11 to 20, default to page 1 limit 10
    @Query('page') page: number,
    @Query('limit') limit: number,
  ): Promise<ResponseVo<any>> {
    try {
      const data = await this.walletService.getUserJackpotTicket(
        req.user.userId,
        page ?? 1,
        limit ?? 10,
      );
      return {
        statusCode: HttpStatus.OK,
        data: data,
        message: 'get user jackpot ticket success',
      };
    } catch (error) {
      this.logger.error(error);
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        data: null,
        message: 'get user jackpot ticket failed',
      };
    }
  }
}
