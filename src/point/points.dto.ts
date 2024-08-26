import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class SetReferralPrizeBonusDto {
  @ApiProperty()
  @IsNotEmpty()
  referralPrizeBonusTier1: string;

  @ApiProperty()
  @IsNotEmpty()
  referralPrizeBonusTier2: string;

  @ApiProperty()
  @IsNotEmpty()
  referralPrizeBonusTier3: string;

  @ApiProperty()
  @IsNotEmpty()
  referralPrizeBonusTier4: string;

  @ApiProperty()
  @IsNotEmpty()
  referralPrizeBonusTier5: string;

  @ApiProperty()
  @IsNotEmpty()
  referralPrizeBonusTier6: string;

  @ApiProperty()
  @IsNotEmpty()
  referralPrizeBonusTier7: string;

  @ApiProperty()
  @IsNotEmpty()
  referralPrizeBonusTier8: string;

  @ApiProperty()
  @IsNotEmpty()
  referralPrizeBonusTier9: string;

  @ApiProperty()
  @IsNotEmpty()
  referralPrizeBonusTier10: string;
}
