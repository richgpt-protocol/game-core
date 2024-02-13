import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { FileModule } from '../enum/file-module.enum';
import { ImageSize } from '../enum/image-size.enum';

export class UploadImageDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  file: any;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  fileName: string;

  @ApiProperty({
    enum: FileModule,
  })
  @IsNotEmpty()
  @IsString()
  module: string;

  @ApiProperty({
    enum: ImageSize,
    required: false,
  })
  @IsString()
  @IsOptional()
  imageSizeType?: string;
}

export class UploadDocumentDto {
  @ApiProperty({ type: 'file' })
  file: any;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  fileName: string;

  @ApiProperty({
    enum: FileModule,
  })
  @IsNotEmpty()
  @IsString()
  module: string;
}
