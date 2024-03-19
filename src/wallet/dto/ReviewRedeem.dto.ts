import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsBoolean
} from 'class-validator';

export class ReviewRedeemDto {
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  redeemTxId: number;

  @ApiProperty()
  @IsBoolean()
  @IsNotEmpty()
  payoutCanProceed: boolean;

  @ApiProperty()
  @IsString()
  payoutNote: string;
}
