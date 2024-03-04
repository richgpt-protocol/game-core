import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsBoolean,
  IsNumber,
} from 'class-validator';

export class BetDto {
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  epoch: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  number: string;

  @ApiProperty()
  @IsBoolean()
  @IsNotEmpty()
  forecast: boolean;

  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  amount: number;
}
