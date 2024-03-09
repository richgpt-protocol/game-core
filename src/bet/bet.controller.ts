// import {
//   Body,
//   Controller,
//   Get,
//   HttpStatus,
//   Post,
//   Query,
//   Request,
// } from '@nestjs/common';
// import { ApiHeader, ApiResponse, ApiTags } from '@nestjs/swagger';
// import { Secure } from 'src/shared/decorators/secure.decorator';
// import { UserRole } from 'src/shared/enum/role.enum';
// import { ResponseVo } from 'src/shared/vo/response.vo';
// import { BetService } from './bet.service';
// import { BetDto } from './dto/Bet.dto';

// @ApiTags('Bet')
// @Controller('api/v1/bet')
// export class BetController {
//   constructor(private betService: BetService) {}

//   @Secure(null, UserRole.USER)
//   @Post('bet')
//   @ApiHeader({
//     name: 'x-custom-lang',
//     description: 'Custom Language',
//   })
//   @ApiResponse({
//     status: HttpStatus.OK,
//     description: 'OK',
//     type: ResponseVo,
//   })
//   async bet(
//     @Request() req,
//     @Body() payload: BetDto[],
//     // @IpAddress() ipAddress,
//     // @HandlerClass() classInfo: IHandlerClass,
//     // @I18n() i18n: I18nContext,
//   ): Promise<ResponseVo<any>> {
//     try {
//       await this.betService.bet(req.user.userId, payload);
//       return {
//         statusCode: HttpStatus.OK,
//         data: null,
//         message: 'bet success',
//       };
//     } catch (error) {
//       return {
//         statusCode: HttpStatus.BAD_REQUEST,
//         data: null,
//         message: error.message,
//       };
//     }
//   }

//   // TODO: update bet after set draw result
//   @Secure(null, UserRole.ADMIN)
//   @Post('set-last-minute-bet')
//   async setLastMinuteBet() {}

//   @Secure(null, UserRole.USER)
//   @Get('get-user-bets')
//   @ApiHeader({
//     name: 'x-custom-lang',
//     description: 'Custom Language',
//   })
//   @ApiResponse({
//     status: HttpStatus.OK,
//     description: 'OK',
//     type: ResponseVo,
//   })
//   async getUserBets(
//     @Request() req,
//     @Query('epoch') epoch: number,
//     // @IpAddress() ipAddress,
//     // @HandlerClass() classInfo: IHandlerClass,
//     // @I18n() i18n: I18nContext,
//   ): Promise<ResponseVo<any>> {
//     const bets = await this.betService.getUserBets(req.user.userId, epoch);
//     return {
//       statusCode: HttpStatus.OK,
//       data: bets,
//       message: '',
//     };
//   }
// }
