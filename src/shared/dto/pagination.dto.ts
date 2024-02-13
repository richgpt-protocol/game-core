import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export abstract class PaginationDto {
  @ApiProperty({
    description: 'To indicate current page of the listing',
    required: false,
  })
  @IsOptional()
  page?: number;

  @ApiProperty({
    description: 'To indicate number of records return for single page.',
    required: false,
  })
  @IsOptional()
  limit?: number;

  @ApiProperty({
    description: 'field name',
    required: false,
  })
  @IsOptional()
  orderBy?: string;

  @ApiProperty({
    description: '1 - ASC, -1 - DESC, 0 - No sort',
    required: false,
    default: 0,
  })
  @IsOptional()
  orderSequence?: number;
}
