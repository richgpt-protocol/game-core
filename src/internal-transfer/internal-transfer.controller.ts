import {
  BadRequestException,
  Body,
  Controller,
  HttpStatus,
  Post,
  Request,
} from '@nestjs/common';
import { TransferGameUSDDto } from './dto/InternalTransferDto';
import { InternalTransferService } from './internal-transfer.service';
import { ResponseVo } from 'src/shared/vo/response.vo';
import { Secure } from 'src/shared/decorators/secure.decorator';
import { UserRole } from 'src/shared/enum/role.enum';
import { ApiBody, ApiTags } from '@nestjs/swagger';

@ApiTags('InternalTransfer')
@Controller('api/v1/internal-transfer')
export class InternalTransferController {
  constructor(private internalTransferService: InternalTransferService) {}

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
    const userId = req.user.id;
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
}
