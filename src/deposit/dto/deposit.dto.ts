import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateDeopsitRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  chainId: number;

  @ApiProperty()
  @IsString()
  amount: string;
}

export class SupplyDto {
  @ApiProperty()
  @IsNotEmpty()
  amount: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty()
  @IsNotEmpty()
  chainId: number;

  @ApiProperty()
  @IsNotEmpty()
  tokenAddress: string;

  @ApiProperty()
  @IsNotEmpty()
  txHash: string;
}
