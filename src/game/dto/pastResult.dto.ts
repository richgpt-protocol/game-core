import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, IsOptional } from 'class-validator';

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
  @IsNumber()
  @IsOptional()
  startDate: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  endDate: number;
}
