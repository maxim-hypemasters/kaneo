import { HTTPException } from "hono/http-exception";
import { z } from "../openapi";

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// The pattern alone accepts days the calendar would roll over (2026-02-30),
// so the day must survive a round trip through UTC. PostgreSQL has no year 0.
export function isCalendarDay(value: string) {
  if (!DAY_PATTERN.test(value)) return false;
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);
  return (
    year > 0 &&
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export const isoDay = z
  .string()
  .refine(isCalendarDay, "Expected a calendar day as YYYY-MM-DD")
  .openapi({
    format: "date",
    pattern: DAY_PATTERN.source,
    example: "2026-10-20",
  });

export type ReleaseDates = {
  startDate: string;
  codeFreezeDate: string;
  submissionDate: string;
};

// YYYY-MM-DD strings sort as the days they name. Equal days are allowed.
export function assertReleaseDateOrder(dates: ReleaseDates) {
  if (
    dates.startDate > dates.codeFreezeDate ||
    dates.codeFreezeDate > dates.submissionDate
  ) {
    throw new HTTPException(400, {
      message: "Dates must run start ≤ code freeze ≤ submission",
    });
  }
}
