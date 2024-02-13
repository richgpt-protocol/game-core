import { ApiProperty } from '@nestjs/swagger';
import {
  IsAlphanumeric,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { IsPassword } from 'src/shared/decorators/is-password.decorator';
import { IsUsername } from 'src/shared/decorators/is-username.decorator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { AdminType } from 'src/shared/enum/role.enum';
import { AdminStatus } from 'src/shared/enum/status.enum';

export class AdminDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @IsUsername({
    message:
      'Username must be at least more than 5 characters, no spaces and special characters.',
  })
  username: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsEmail()
  emailAddress: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @IsPassword({
    message:
      'Please use 8 or more characters with a mix of upper and lower letters, numbers/symbols for your new password.',
  })
  password: string;

  @ApiProperty({
    description: `Pass either 'S' - (Superuser), 'F' - (Finance), 'M' - (Marketing), O - (Operations), R - (Recruiter)`,
    enum: AdminType,
  })
  @IsString()
  @IsNotEmpty()
  adminType: string;

  @ApiProperty({
    description: `Pass 'A' (Active), 'I' (Inactive), 'S' (Suspended) flag`,
    enum: AdminStatus,
  })
  @IsString()
  @IsNotEmpty()
  status: string;
}

export class UpdateAdminDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsEmail()
  emailAddress: string;

  @ApiProperty({
    description: `Pass either 'S' - (Superuser), 'F' - (Finance), 'M' - (Marketing), O - (Operations), R - (Recruiter)`,
    enum: AdminType,
  })
  @IsString()
  @IsNotEmpty()
  adminType: string;

  @ApiProperty({
    description: `Pass 'A' (Active), 'I' (Inactive), 'S' (Suspended) flag`,
    enum: AdminStatus,
  })
  @IsString()
  @IsNotEmpty()
  status: string;
}

export class GetAdminListDto extends PaginationDto {
  @ApiProperty()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  username?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  emailAddress?: string;

  @ApiProperty({
    description: `Pass either 'S' - (Superuser)`,
    enum: AdminType,
  })
  @IsString()
  @IsOptional()
  adminType?: string;

  @ApiProperty({
    enum: AdminStatus,
  })
  @IsString()
  @IsOptional()
  status?: string;

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
