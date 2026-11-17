import Holidays from "date-holidays";
import { cached } from "../../utils/bounded-cache";
import type { HolidayCalendarCode } from "./catalog";
import { holidayDates } from "./expand-holiday";
import { holidayLanguage } from "./holiday-language";

export type MemberHoliday = { date: string; name: string };

const INSTANCE_LIMIT = 200;
const RESULT_LIMIT = 500;
const instances = new Map<string, Holidays>();
const results = new Map<string, readonly MemberHoliday[]>();

// One instance per calendar and language. getHolidays(year, lang) adds the
// language to the instance's own list, so the language is fixed here and
// never passed per call. Only `public` days count: bank, school, optional
// and observance days are left out.
function calendarHolidays(
  key: string,
  calendar: HolidayCalendarCode,
  lang: string,
) {
  return cached(
    instances,
    INSTANCE_LIMIT,
    key,
    () =>
      new Holidays(
        { country: calendar.country, state: calendar.region ?? undefined },
        { types: ["public"], languages: [lang] },
      ),
  );
}

// The calendar's public holidays that fall in `year`, sorted, one entry per
// day (names of holidays sharing a day are joined). A holiday that starts in
// December of the year before contributes its days in `year`. Unknown codes
// return [] and never throw.
export function resolveHolidays(
  calendar: HolidayCalendarCode,
  year: number,
  lang?: string,
): readonly MemberHoliday[] {
  const language = holidayLanguage(lang);
  const key = `${calendar.country}|${calendar.region ?? ""}|${language}`;
  return cached(results, RESULT_LIMIT, `${key}|${year}`, () => {
    const holidays = calendarHolidays(key, calendar, language);
    const prefix = `${String(year).padStart(4, "0")}-`;
    const names = new Map<string, string[]>();
    for (const holiday of [
      ...holidays.getHolidays(year - 1),
      ...holidays.getHolidays(year),
    ]) {
      for (const date of holidayDates(holiday)) {
        if (!date.startsWith(prefix)) continue;
        const list = names.get(date) ?? [];
        if (!list.includes(holiday.name)) list.push(holiday.name);
        names.set(date, list);
      }
    }
    return [...names]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, list]) => ({ date, name: list.join(", ") }));
  });
}
