import { IsEnum } from 'class-validator';

export enum Language {
  EN = 'en',
  ZH_HANS = 'zh-hans',
}

export class UpdateUserLanguageDto {
  @IsEnum(Language)
  language: Language;
}
