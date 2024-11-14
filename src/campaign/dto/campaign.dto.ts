import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
} from 'class-validator';
import { ClaimApproach } from 'src/shared/enum/campaign.enum';

export class CreateCampaignDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumberString()
  rewardPerUser: number;

  @ApiProperty()
  @IsString()
  banner: string;

  @ApiProperty()
  @IsNumberString()
  @IsNotEmpty()
  startTime: string;

  @ApiProperty()
  @IsNumberString()
  @IsNotEmpty()
  endTime: string;

  @ApiProperty()
  @IsNumberString()
  @IsNotEmpty()
  maxUsers: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  referralCode: string;

  @ApiProperty({
    type: 'string',
    description: 'Comma separated referral codes to be ignored',
  })
  @IsString()
  @IsOptional()
  ignoredReferralCodes: string;

  @ApiProperty({
    type: 'string',
    description: 'When the campaign is triggered (onSignUp, onDeposit etc)',
  })
  @IsString()
  @IsNotEmpty()
  claimApproach: ClaimApproach;
}

export class ExecuteClaimDto {
  @ApiProperty()
  @IsNotEmpty()
  claimApproach: ClaimApproach;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  userId: number;
}
