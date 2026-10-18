import { Result } from "effect";
import type { ReleaseDates } from "../api/releases.js";
import { InvalidArgument } from "../errors/errors.js";

const ORDER_HINT =
  "Dates must run start ≤ code freeze ≤ submission. Equal days are allowed.";

export function checkReleaseDateOrder(
  dates: ReleaseDates,
): Result.Result<void, InvalidArgument> {
  if (dates.codeFreezeDate < dates.startDate) {
    return Result.fail(
      new InvalidArgument({
        message: `The code freeze (${dates.codeFreezeDate}) is before the start date (${dates.startDate}).`,
        hint: ORDER_HINT,
      }),
    );
  }
  if (dates.submissionDate < dates.codeFreezeDate) {
    return Result.fail(
      new InvalidArgument({
        message: `The submission date (${dates.submissionDate}) is before the code freeze (${dates.codeFreezeDate}).`,
        hint: ORDER_HINT,
      }),
    );
  }
  return Result.succeed(undefined);
}

// "Oct 20", with the year only when it isn't this year's. Read in UTC, as a
// calendar day has no time zone.
export function formatReleaseDay(day: string, today: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
    ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
  });
}
