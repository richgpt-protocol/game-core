import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty } from 'class-validator';

export class AdminNotificationDto {
  type?: string;
  title: string;
  message: string;
  filterAdminIds?: number[];
}

export class UpdateAdminNotificationDto {
  @ApiProperty({
    type: [Number],
  })
  @IsArray()
  @IsNotEmpty()
  notificationIds: number[];
}
