// import { Body, Controller, HttpStatus, Post, Request } from '@nestjs/common';
// import { ApiTags } from '@nestjs/swagger';
// import { Secure } from 'src/shared/decorators/secure.decorator';
// import { UserRole } from 'src/shared/enum/role.enum';
// import { RedeemService } from './redeem.service';
// import { RedeemDto } from './dto/Redeem.dto';

// @ApiTags('Redeem')
// @Controller('api/v1/redeem')
// export class RedeemController {
//   constructor(private redeemService: RedeemService) {}

//   @Secure(null, UserRole.USER)
//   @Post('redeem')
//   async redeem(@Request() req, @Body() payload: RedeemDto) {
//     try {
//       await this.redeemService.redeem(req.user.userId, payload);
//       return {
//         statusCode: HttpStatus.OK,
//         data: null,
//         message: 'redeem success',
//       };
//     } catch (error) {
//       return {
//         statusCode: HttpStatus.BAD_REQUEST,
//         data: null,
//         message: error.message,
//       };
//     }
//   }
// }
