import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { UserRole } from 'src/shared/enum/role.enum';

export class AuditLogDto extends PaginationDto {
  @ApiProperty({
    enum: UserRole,
  })
  @IsString()
  @IsNotEmpty()
  role: string;
}
