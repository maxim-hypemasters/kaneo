import { countWorkdays } from "./count-workdays";
import type { DayRange } from "./day-range";

// Working days of the range that fall inside one Jan-Dec allowance year.
export function workdaysInYear(
  range: DayRange,
  year: number,
  holidays: ReadonlySet<string>,
) {
  const yearStart = `${String(year).padStart(4, "0")}-01-01`;
  const yearEnd = `${String(year).padStart(4, "0")}-12-31`;
  return countWorkdays(
    range.startDate > yearStart ? range.startDate : yearStart,
    range.endDate < yearEnd ? range.endDate : yearEnd,
    holidays,
  );
}
