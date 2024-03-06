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

export enum Permutations {
  pairs_24,
  pairs_12,
  pairs_6,
  pairs_4,
  none,
}

export class FormatBetsDTO {
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

  @ApiProperty()
  @IsNotEmpty()
  permutation: Permutations;
}
