import type { MemberHoliday } from "./resolve-holidays";

// Each member's calendar holiday days ("YYYY-MM-DD"). Members without a
// calendar have no entry.
export type HolidayDays = ReadonlyMap<string, ReadonlySet<string>>;

export function toHolidayDays(
  byUser: ReadonlyMap<string, readonly MemberHoliday[]>,
): HolidayDays {
  return new Map(
    [...byUser].map(([userId, holidays]) => [
      userId,
      new Set(holidays.map((holiday) => holiday.date)),
    ]),
  );
}

// The window of whole Jan-Dec years, from the first year to the last.
export function yearsWindow(years: readonly number[]) {
  return {
    from: `${Math.min(...years)}-01-01`,
    to: `${Math.max(...years)}-12-31`,
  };
}
