export class EnumUtil {
  public static checkExistEnum(value: any, list: any) {
    return Object.values(list).includes(value);
  }
}
