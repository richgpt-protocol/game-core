import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber } from 'class-validator';

export class DrawResultDto {
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  epoch: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  first: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  second: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  third: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  special1: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  special2: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  special3: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  special4: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  special5: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  special6: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  special7: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  special8: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  special9: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  special10: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  consolation1: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  consolation2: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  consolation3: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  consolation4: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  consolation5: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  consolation6: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  consolation7: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  consolation8: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  consolation9: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  consolation10: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  consolation11: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  consolation12: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  consolation13: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  consolation14: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  consolation15: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  consolation16: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  consolation17: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  consolation18: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  consolation19: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  consolation20: string;
}
