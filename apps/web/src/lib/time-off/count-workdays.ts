import { calendarDayCount } from "./calendar-day-count";

// For members without a holiday calendar, or before theirs loads.
export const NO_HOLIDAYS: ReadonlySet<string> = new Set();

function isWeekday(day: string) {
  const weekday = new Date(Date.parse(day)).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

// Inclusive working days on YYYY-MM-DD strings: Monday to Friday, minus the
// member's calendar holidays on one of them. 0 when the start is after the
// end. A preview only: the API's `days` is what counts. Whole weeks hold
// five weekdays each, which leaves fewer than seven days to check.
export function countWorkdays(
  startDate: string,
  endDate: string,
  holidays: ReadonlySet<string>,
) {
  const days = calendarDayCount(startDate, endDate);
  const firstWeekday = new Date(Date.parse(startDate)).getUTCDay();
  let workdays = Math.floor(days / 7) * 5;
  for (let offset = 0; offset < days % 7; offset++) {
    const weekday = (firstWeekday + offset) % 7;
    if (weekday !== 0 && weekday !== 6) workdays++;
  }
  for (const day of holidays) {
    if (day >= startDate && day <= endDate && isWeekday(day)) workdays--;
  }
  return workdays;
}
