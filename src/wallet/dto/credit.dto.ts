import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AddCreditDto {
  @IsNotEmpty()
  amount: number;

  @IsNotEmpty()
  @IsString()
  walletAddress: string;

  @IsOptional()
  campaignId?: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class AddCreditBackofficeDto {
  @IsNotEmpty()
  gameUsdAmount: number;

  @IsNotEmpty()
  usdtAmount: number;

  @IsNotEmpty()
  @IsString()
  uid: string;

  @IsOptional()
  campaignId?: number;
}
