import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber } from 'class-validator';

export class BetDto {
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
  epochs: number[];

  @ApiProperty()
  @IsNotEmpty()
  isPermutation: boolean;
}

export class EstimateBetResponseDTO {
  groupedAmount: {
    id: number;
    numberPairs: string;
    calculatedAmount: number;
  }[];
  totalAmount: number;
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
