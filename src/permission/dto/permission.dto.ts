import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';
import { IsRole } from 'src/shared/decorators/is-role.decorator';

export class PermissionDto {
  @ApiProperty({
    description:
      'S - Superuser, F - Finance, M - Marketing, O - Operations, R - Recruiter',
  })
  @IsNotEmpty()
  @IsRole()
  role!: string;
}
