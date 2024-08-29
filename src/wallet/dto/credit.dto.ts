import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AddCreditDto {
  @IsNotEmpty()
  amount: number;

  @IsNotEmpty()
  @IsString()
  walletAddress: string;

  @IsOptional()
  campaignId?: number;
}
