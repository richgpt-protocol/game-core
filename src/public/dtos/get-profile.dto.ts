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
}
