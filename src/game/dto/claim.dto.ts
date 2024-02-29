import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsBoolean,
  IsNumber,
} from 'class-validator';
import { BetDto } from './bet.dto';

export class ClaimDto extends BetDto {
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  drawResultIndex: number;
}
