import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class DepositDTO {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  depositerAddress: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  walletAddress: string;

  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  txHash: string;

  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  chainId: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  tokenAddress: string;

  @ApiProperty()
  @IsOptional()
  @IsNumber()
  usdtTxId: number;
}

export class ReviewDepositDto {
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  depositTxId: number;

  @ApiProperty()
  @IsBoolean()
  @IsNotEmpty()
  status: boolean;

  @ApiProperty()
  @IsString()
  note: string;
}
