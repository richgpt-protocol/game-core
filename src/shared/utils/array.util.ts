export class ArrayUtil {
  public static findUnMatchingValuesForFirstItem(
    first: any[],
    second: any[],
    property?: string,
  ) {
    const newArray = [];
    if (property != null) {
      for (const i in first) {
        for (const a in second) {
          if (a[property] !== i[property]) {
            newArray.push(i);
          }
        }
      }
    } else {
      for (const i in first) {
        if (second.indexOf(i) < 0) {
          newArray.push(i);
        }
      }
    }
    return newArray;
  }
}
