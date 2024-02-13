import * as moment from 'moment';
import { DurationInputArg2 } from 'moment';
export class DateUtil {
  /**
   * Compares two Date objects and returns e number value that represents
   * the result:
   * 0 if the two dates are equal.
   * 1 if the first date is greater than second.
   * -1 if the first date is less than second.
   * @param date1 First date object to compare.
   * @param date2 Second date object to compare.
   */
  public static compareDate(date1: Date, date2: Date): number {
    // With Date object we can compare dates them using the >, <, <= or >=.
    // The ==, !=, ===, and !== operators require to use date.getTime(),
    // so we need to create a new instance of Date with 'new Date()'
    const d1 = new Date(date1);
    const d2 = new Date(date2);

    // Check if the dates are equal
    const same = d1.getTime() === d2.getTime();
    if (same) return 0;

    // Check if the first is greater than second
    if (d1 > d2) return 1;

    // Check if the first is less than second
    if (d1 < d2) return -1;
  }

  // Every Monday
  public static calculateMerchantSalesChargesDate(date: Date) {
    date.setDate(date.getDate() + ((1 + 7 - date.getDay()) % 7));
    return date;
  }

  public static getTrimTime(date: Date) {
    date.setHours(0, 0, 0, 0);
    return date;
  }

  public static monthDiff(d1: Date, d2: Date) {
    let months;
    months = (d2.getFullYear() - d1.getFullYear()) * 12;
    months -= d1.getMonth();
    months += d2.getMonth();
    return months <= 0 ? 0 : months;
  }

  public static yearDiff(d1: Date, d2: Date) {
    return moment(d1).diff(d2, 'years', false);
  }

  // Format = 'YYYY-MM-DD'
  public static parseStringtoDate(value: string, format?: string) {
    if (format) {
      return moment(value, format).toDate();
    } else {
      return moment(value).toDate();
    }
  }

  public static addDays(date: Date, noOfDay: number) {
    return moment(date).add(noOfDay, 'days').toDate();
  }

  public static addTime(date: Date, amount: number, unit: DurationInputArg2) {
    return moment(date).add(amount, unit).toDate();
  }

  public static formatDate(date: Date, format = 'YYYYMMDDHHmmss') {
    return moment(date).format(format);
  }

  public static formatDateWithAddedHours(
    date: Date,
    format = 'YYYYMMDDHHmmss',
    hours: number,
  ) {
    return moment(date).add(hours, 'hours').format(format);
  }
}
