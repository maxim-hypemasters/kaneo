import type { HolidayCalendarCode } from "./catalog";

// Whether two calendars are the same; null ("No calendar") equals only null.
export function sameHolidayCalendar(
  a: HolidayCalendarCode | null,
  b: HolidayCalendarCode | null,
) {
  if (a === null || b === null) return a === b;
  return a.country === b.country && a.region === b.region;
}
