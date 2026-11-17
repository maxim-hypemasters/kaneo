import type { DayRange } from "./day-range";
import { daysByYear, type YearDays } from "./days-by-year";
import type { TimeOffBalance } from "./summarize-balance";
import type { TimeOffType } from "./time-off-kinds";

// For each year a pending request costs working days in, how far approving
// it would take the requester past that year's allowance of the request's
// type: max(0, used + days in the year - allowance). Other pending requests
// are not counted. Years without a balance in the list are left out.
export function overAllowanceDays(
  request: DayRange & { type: TimeOffType },
  balances: readonly TimeOffBalance[],
  holidays: ReadonlySet<string>,
): YearDays[] {
  return daysByYear(request, holidays).flatMap(({ year, days }) => {
    const balance = balances.find((candidate) => candidate.year === year)
      ?.types[request.type];
    if (!balance) return [];
    return [
      {
        year,
        days: Math.max(0, balance.usedDays + days - balance.allowanceDays),
      },
    ];
  });
}
