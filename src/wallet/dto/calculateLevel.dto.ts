import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty } from 'class-validator';

export class CalculateLevelDto {
  @ApiProperty({ type: Number })
  @IsNotEmpty()
  point: number;
}
