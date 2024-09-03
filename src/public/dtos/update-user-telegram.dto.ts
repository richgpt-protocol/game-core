import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class UpdateUserTelegramDto {
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  tgId: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  tgUsername: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  uid: string;
}
