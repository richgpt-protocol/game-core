import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';

export class UpdateTaskXpDto {
  @ApiProperty()
  @IsNumber()
  xp: number;

  @ApiProperty()
  @IsString()
  uid: string;

  @ApiProperty()
  @IsNumber()
  taskId: number;
}
