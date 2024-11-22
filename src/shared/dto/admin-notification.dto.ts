import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export enum NotificationType {
  TELEGRAM = 'TELEGRAM',
  INBOX = 'INBOX',
}

export class UserMessageDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsArray()
  @IsNotEmpty()
  userIds: Array<string>;

  @IsArray()
  @IsNotEmpty()
  channels: Array<NotificationType>;
}
