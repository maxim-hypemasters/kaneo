import { calendarDayCount } from "./calendar-day-count";
import { weekdayHolidaysBetween } from "./weekday-holidays-in-year";

// For members without a holiday calendar.
export const NO_HOLIDAYS: ReadonlySet<string> = new Set();

// Inclusive working days on UTC calendar days: Monday to Friday, minus the
// member's calendar holidays that fall on one of them. 0 when the start is
// after the end. Whole weeks hold five weekdays each, which leaves fewer
// than seven days to check one by one.
export function countWorkdays(
  startDate: string,
  endDate: string,
  holidays: ReadonlySet<string>,
) {
  const days = calendarDayCount(startDate, endDate);
  const firstWeekday = new Date(Date.parse(startDate)).getUTCDay();
  let weekdays = Math.floor(days / 7) * 5;
  for (let offset = 0; offset < days % 7; offset++) {
    const weekday = (firstWeekday + offset) % 7;
    if (weekday !== 0 && weekday !== 6) weekdays++;
  }
  return weekdays - weekdayHolidaysBetween(holidays, startDate, endDate);
}
