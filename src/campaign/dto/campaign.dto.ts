import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsNumberString,
  IsString,
} from 'class-validator';

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
}
