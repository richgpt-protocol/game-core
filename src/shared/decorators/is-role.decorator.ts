import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { AdminType } from '../enum/role.enum';
import { EnumUtil } from '../utils/enum.util';

export function IsRole(validationOptions?: ValidationOptions) {
  // eslint-disable-next-line @typescript-eslint/ban-types
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isRole',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        validate(value: any, args: ValidationArguments) {
          if (value != null) {
            return EnumUtil.checkExistEnum(value, AdminType);
          }
          return false;
        },
      },
    });
  };
}
