function isWeekday(day: string) {
  const weekday = new Date(Date.parse(day)).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

// Holidays from Monday to Friday within [startDate, endDate]. A set never
// repeats a day.
export function weekdayHolidaysBetween(
  holidays: ReadonlySet<string>,
  startDate: string,
  endDate: string,
) {
  let count = 0;
  for (const day of holidays) {
    if (day >= startDate && day <= endDate && isWeekday(day)) count++;
  }
  return count;
}

// A calendar's weekday holidays in one Jan-Dec year: the public_holiday days
// it uses up without a request.
export function weekdayHolidaysInYear(
  holidays: ReadonlySet<string>,
  year: number,
) {
  const prefix = String(year).padStart(4, "0");
  return weekdayHolidaysBetween(holidays, `${prefix}-01-01`, `${prefix}-12-31`);
}
