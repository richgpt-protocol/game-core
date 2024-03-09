import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty } from 'class-validator';

export class ClaimDto {
  @ApiProperty({
    type: [Number],
    description: 'Bet Ids in number array format.',
  })
  @IsArray()
  @IsNotEmpty()
  betIds: number[];
}
