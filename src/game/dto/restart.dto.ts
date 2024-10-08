import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber } from 'class-validator';

export class RestartReferralDistribution {
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  walletTxId: number;

  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  gameUsdTxId: number; // The betting gameUsdTx
}

export class RestartBetDto {
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  userId: number;

  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  gameUsdTxId: number; // The betting gameUsdTx
}
