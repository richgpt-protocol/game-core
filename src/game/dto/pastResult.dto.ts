import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

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
  @IsOptional()
  startDate: string;

  @ApiProperty({ required: false })
  @IsOptional()
  endDate: string;
}
