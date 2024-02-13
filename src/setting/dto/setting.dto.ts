import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SettingDetail {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  key: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  value: string;
}

export class SettingDto {
  @ApiProperty({
    type: [SettingDetail],
    description: 'Setting Details with the key and value combined',
    required: true,
  })
  @IsArray()
  @IsNotEmpty()
  details: SettingDetail[];
}
