import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
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
  @IsNotEmpty()
  @IsString()
  @IsEmail()
  emailAddress: string;

  @ApiProperty()
  @IsString()
  password: string;
}

export class OAuthDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token: string;
}
