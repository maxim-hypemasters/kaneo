import { type HolidayCalendarCode, holidayCalendarNames } from "./catalog";

// A calendar with display names in `lang`, or null without one.
export function presentHolidayCalendar(
  calendar: HolidayCalendarCode | null,
  lang?: string,
) {
  if (!calendar) return null;
  return { ...calendar, ...holidayCalendarNames(calendar, lang) };
}
