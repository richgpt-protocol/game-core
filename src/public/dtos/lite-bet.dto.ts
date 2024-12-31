import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { BetDto } from 'src/game/dto/Bet.dto';

export class LiteBetDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  uid: string;

  @ApiProperty()
  @IsNotEmpty()
  bets: BetDto[];
}
