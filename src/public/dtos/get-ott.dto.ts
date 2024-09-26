import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class GetOttDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  uid: string;
}
