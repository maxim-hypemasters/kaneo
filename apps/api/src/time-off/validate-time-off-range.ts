import { ApiError } from "../errors/api-error";
import { calendarDayCount } from "./calendar-day-count";
import { MAX_RANGE_DAYS } from "./constants";
import { countWorkdays } from "./count-workdays";
import type { DayRange } from "./day-range";

function rangeError(message: string) {
  return new ApiError(400, { code: "TIME_OFF_RANGE", message });
}

// YYYY-MM-DD strings sort as the days they name. Equal days are allowed.
export function assertTimeOffDateOrder({ startDate, endDate }: DayRange) {
  if (startDate > endDate) {
    throw rangeError("The start date must be on or before the end date");
  }
}

// Limits on new dates: at most MAX_RANGE_DAYS calendar days, from Jan 1 of
// last year to Dec 31 of next year (late sick days in January still fit, and
// balances only ever span those years). `today` is the server's UTC day.
export function assertTimeOffRangeLimits(range: DayRange, today: string) {
  if (calendarDayCount(range.startDate, range.endDate) > MAX_RANGE_DAYS) {
    throw rangeError(`Time off can span at most ${MAX_RANGE_DAYS} days`);
  }
  const year = Number(today.slice(0, 4));
  const earliest = `${year - 1}-01-01`;
  const latest = `${year + 1}-12-31`;
  if (range.startDate < earliest || range.endDate > latest) {
    throw rangeError(`Time off must fall between ${earliest} and ${latest}`);
  }
}

// New dates need a working day: a weekday that is not one of the member's
// calendar holidays. Callers read the holidays inside the transaction, under
// the member's lock.
export function assertHasWorkday(
  range: DayRange,
  holidays: ReadonlySet<string>,
) {
  if (countWorkdays(range.startDate, range.endDate, holidays) === 0) {
    throw new ApiError(400, {
      code: "TIME_OFF_NO_WEEKDAYS",
      message: "Time off must include at least one working day",
    });
  }
}

// The checks that need no database. A create passes no previous range and
// gets every check. An edit passes the stored range: the merged dates are
// always checked for order, and the limits apply only when a date changed,
// so the type or note of older time off can still be fixed. New dates also
// need assertHasWorkday.
export function validateTimeOffRange(
  range: DayRange,
  today: string,
  previous?: DayRange,
) {
  assertTimeOffDateOrder(range);
  if (
    previous?.startDate === range.startDate &&
    previous.endDate === range.endDate
  ) {
    return;
  }
  assertTimeOffRangeLimits(range, today);
}
