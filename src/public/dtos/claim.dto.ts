import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ClaimJackpotDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  uid: string;
}
