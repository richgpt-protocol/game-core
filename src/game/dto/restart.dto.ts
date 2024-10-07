import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber } from 'class-validator';

export class RestartReferralDistribution {
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  walletTxId: number;
}
