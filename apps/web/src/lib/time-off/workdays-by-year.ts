import { countWorkdays } from "./count-workdays";

export type YearDays = { year: number; days: number };

// The range's working days per Jan-Dec allowance year, ascending, leaving
// out the member's calendar holidays. A year the range touches only on
// weekends or holidays costs nothing and is left out, as the API does for
// `daysByYear`.
export function workdaysByYear(
  startDate: string,
  endDate: string,
  holidays: ReadonlySet<string>,
): YearDays[] {
  if (startDate > endDate) return [];
  const result: YearDays[] = [];
  const last = Number(endDate.slice(0, 4));
  for (let year = Number(startDate.slice(0, 4)); year <= last; year++) {
    const yearStart = `${String(year).padStart(4, "0")}-01-01`;
    const yearEnd = `${String(year).padStart(4, "0")}-12-31`;
    const days = countWorkdays(
      startDate > yearStart ? startDate : yearStart,
      endDate < yearEnd ? endDate : yearEnd,
      holidays,
    );
    if (days > 0) result.push({ year, days });
  }
  return result;
}
