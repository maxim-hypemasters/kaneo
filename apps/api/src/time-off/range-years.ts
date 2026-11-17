import type { DayRange } from "./day-range";

// Every calendar year the ranges touch, ascending and without repeats. An
// edit passes the old and new range so balances cover both.
export function rangeYears(...ranges: DayRange[]) {
  const years = new Set<number>();
  for (const { startDate, endDate } of ranges) {
    const last = Number(endDate.slice(0, 4));
    for (let year = Number(startDate.slice(0, 4)); year <= last; year++) {
      years.add(year);
    }
  }
  return [...years].sort((a, b) => a - b);
}
