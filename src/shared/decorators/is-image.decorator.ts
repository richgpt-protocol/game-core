import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import * as fileTypeBrowser from 'file-type/browser';
import { ImageMimeTypeEnum } from '../enum/mime-type.enum';
import { EnumUtil } from '../utils/enum.util';
import * as fetch from 'node-fetch';
import { BadRequestException } from '@nestjs/common';

export function IsImage(validationOptions?: ValidationOptions) {
  // eslint-disable-next-line @typescript-eslint/ban-types
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isImage',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        async validate(value: any, args: ValidationArguments) {
          if (value != null) {
            try {
              const response = await fetch(value);
              const fileType = await fileTypeBrowser.fileTypeFromBuffer(
                await response.buffer(),
              );
              if (!EnumUtil.checkExistEnum(fileType.mime, ImageMimeTypeEnum)) {
                return false;
              }

              const format = /\.(jpg|jpeg|png|gif)$/;
              return value.match(format) ? true : false;
            } catch (err) {
              throw new BadRequestException('general.IMAGE_IS_NOT_FOUND');
            }
          }
          return false;
        },
      },
    });
  };
}
