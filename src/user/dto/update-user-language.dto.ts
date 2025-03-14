import { IsEnum } from 'class-validator';

export enum Language {
  EN = 'en',
  ZH = 'zh',
}

export class UpdateUserLanguageDto {
  @IsEnum(Language)
  language: Language;
}
