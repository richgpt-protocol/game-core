import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsNumber,
} from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { UserStatus } from 'src/shared/enum/status.enum';
export class RegisterUserDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(15)
  phoneNumber: string;

  // @ApiProperty({
  //   description:
  //     'Please use 8 or more characters with a mix of upper and lower letters, numbers/symbols for your new password.',
  // })
  // @IsString()
  // password: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  referralCode: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  otpMethod: 'WHATSAPP' | 'TELEGRAM' | 'SMS';

  @ApiProperty()
  @IsString()
  @IsOptional()
  fcm: string;
}
export class SignInDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(15)
  phoneNumber: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  otpMethod: 'WHATSAPP' | 'TELEGRAM' | 'SMS';

  @ApiProperty()
  @IsString()
  @IsOptional()
  fcm: string;
}
export class VerifyOtpDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  otp: string;
}
export class UpdateUserDto {
  @ApiProperty()
  @IsString()
  @IsOptional()
  phoneNumber: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  @IsEmail()
  backupEmailAddress: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  otpMethod: 'WHATSAPP' | 'TELEGRAM' | 'SMS';
}

export class GetUsersDto extends PaginationDto {
  @ApiProperty()
  @IsString()
  @IsOptional()
  keyword?: string;

  @ApiProperty({
    enum: UserStatus,
    required: true,
    type: [String],
  })
  @IsArray()
  @IsOptional()
  status: string[];

  @ApiProperty({
    description: 'Format - YYYY-MM-DD',
  })
  @IsString()
  @IsOptional()
  fromDate?: string;

  @ApiProperty({
    description: 'Format - YYYY-MM-DD',
  })
  @IsString()
  @IsOptional()
  toDate?: string;
}

export class UpdateUserByAdminDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  // @ApiProperty()
  // @IsString()
  // @IsNotEmpty()
  // firstName: string;

  // @ApiProperty()
  // @IsString()
  // @IsOptional()
  // @IsEmail()
  // backupEmailAddress: string;

  // @ApiProperty()
  // @IsString()
  // @IsOptional()
  // nric: string;

  @ApiProperty({
    enum: UserStatus,
    required: true,
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  status: string;
}

export class WithdrawlPinDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  pin: string;
}
