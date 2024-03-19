import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber } from 'class-validator';

export class BetDto {
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  epoch: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  numberPair: string;

  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  bigForecastAmount: number;

  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  smallForecastAmount: number;

  @ApiProperty()
  @IsNotEmpty()
  gameIds: number[];
}