import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';
import { IsRole } from 'src/shared/decorators/is-role.decorator';

export class PermissionAccessDto {
  @ApiProperty()
  @IsNotEmpty()
  userId: number;

  @ApiProperty({
    description:
      'S - Superuser, F - Finance, M - Marketing, O - Operations, R - Recruiter',
  })
  @IsNotEmpty()
  @IsRole()
  role!: string;

  @ApiProperty({
    description: 'A - Admin, U - User, H - Huslter',
  })
  @IsNotEmpty()
  userRole!: string;

  @ApiProperty({
    description: 'List of Permission ID',
    type: [Number],
  })
  @IsNotEmpty()
  permissions: number[];
}
