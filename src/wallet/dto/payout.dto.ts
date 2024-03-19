import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsNumber,
} from 'class-validator';

export class PayoutDto {
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  redeemTxId: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  signature: string;
}
