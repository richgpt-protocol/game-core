import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class GetProfileDto {
  @ApiProperty()
  @IsOptional()
  @IsString()
  tgId: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  uid: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  username: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  firstName: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  lastName: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  photoUrl: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  referralCode: string;
}
