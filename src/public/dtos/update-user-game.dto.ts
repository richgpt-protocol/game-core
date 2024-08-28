import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';

export class UpdateUserGameDto {
  @ApiProperty()
  @IsNumber()
  gameUsdAmount: number;

  @ApiProperty()
  @IsNumber()
  usdtAmount: number;

  @ApiProperty()
  @IsString()
  gameSessionToken: string;

  @ApiProperty()
  @IsNumber()
  xp: number;

  @ApiProperty()
  @IsString()
  uid: string;
}
