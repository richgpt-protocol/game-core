import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';
import { IsRole } from 'src/shared/decorators/is-role.decorator';

export class GetPermissionAccessDto {
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
}
