import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsString,
  MinLength,
  MaxLength,
  IsNumber,
  IsOptional,
} from 'class-validator';

export class LoginDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  username: string;

  @ApiProperty()
  @MinLength(8, {
    message:
      'You have enter incorrect account and/or password, please try again.',
  })
  @IsString()
  password: string;

  @ApiProperty({
    description: 'Admin no need to pass rememberMe flag.',
    required: false,
  })
  @IsBoolean()
  rememberMe?: boolean;
}

export class UserLoginDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(15)
  phoneNumber: string;

  @ApiProperty()
  @IsString()
  @MaxLength(6)
  code: string;
}

export class OAuthDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class LoginWithTelegramDTO {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstname: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  hash: string;

  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  telegramId: number;

  @ApiProperty()
  @IsString()
  @IsOptional()
  referralCode: string;
}
