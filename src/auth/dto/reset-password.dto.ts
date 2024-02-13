import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsNumber, IsString } from 'class-validator';
import { UserRole } from 'src/shared/enum/role.enum';

export class ResetPasswordDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  username: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsEmail()
  emailAddress: string;
}

export class UserResetPasswordDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsEmail()
  emailAddress: string;
}

export class PasswordResetDto {
  @ApiProperty({
    description: 'admin Id',
  })
  @IsNotEmpty()
  @IsNumber()
  id: number;

  @ApiProperty({
    enum: UserRole,
    required: true,
    type: String,
  })
  @IsNotEmpty()
  @IsString()
  userRole: string;
}
