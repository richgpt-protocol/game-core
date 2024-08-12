import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export enum SendMode {
  phone,
  uid,
}

export class TransferGameUSDDto {
  @ApiProperty({
    type: Number,
    description: 'amount of Game USD to transfer',
    required: true,
  })
  @IsNotEmpty()
  amount: number;

  @ApiProperty({
    enum: SendMode,
    description: 'Whether to use Phone or UID',
    required: true,
  })
  sendMode: SendMode;

  @ApiProperty({
    type: String,
    description: 'Phone or UID of receiver',
    required: true,
  })
  @IsNotEmpty()
  receiver: string;
}
