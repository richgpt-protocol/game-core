export class ObjectUtil {
  public static isEmpty(obj) {
    return Object.keys(obj).length === 0 && obj.constructor === Object;
  }
}
