import type { DayRange } from "./day-range";
import { rangeYears } from "./range-years";
import { workdaysInYear } from "./workdays-in-year";

export type YearDays = { year: number; days: number };

// The range's working days per allowance year. A year the range touches only
// on weekends or holidays is left out: it costs that year nothing.
export function daysByYear(
  range: DayRange,
  holidays: ReadonlySet<string>,
): YearDays[] {
  return rangeYears(range)
    .map((year) => ({ year, days: workdaysInYear(range, year, holidays) }))
    .filter(({ days }) => days > 0);
}
