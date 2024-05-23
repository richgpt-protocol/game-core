import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, IsDate, IsOptional, Min, Max } from 'class-validator';

export class PastResultDto {
  @ApiProperty({ required: false })
  @IsNotEmpty()
  @IsOptional()
  count: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  numberPair: string;

  @ApiProperty({ required: false })
  // @IsDate()
  @IsOptional()
  date: Date;
}
