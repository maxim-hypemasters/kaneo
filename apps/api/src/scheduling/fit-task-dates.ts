import { createCalendarReader, fitWork } from "./engine/calendar";
import { uniformCalendarWithDaysOff } from "./uniform-calendar";

export const FIT_HORIZON_DAYS = 365;
const DAY_MS = 86_400_000;

export type Reservation = { start: Date; end: Date };
export type FittedDates = { startDate: Date; dueDate: Date };

// Dates for `minutes` of working effort, starting no earlier than `now`, on
// the uniform Monday–Friday calendar of `timeZone` without `blockedDays` (the
// assignee's days away, local YYYY-MM-DD) and without the time other work
// holds (`reservations`). Null when it doesn't fit within FIT_HORIZON_DAYS.
//
// fitWork needs one free gap between reservations for the whole effort, so a
// long span of other work would push even a small task past its end. The
// reservations are taken off the calendar instead: the effort is split across
// the free time around them, the way someone juggling several tasks works.
export function fitTaskDates({
  minutes,
  now,
  timeZone,
  blockedDays = [],
  reservations = [],
}: {
  minutes: number;
  now: Date;
  timeZone: string;
  blockedDays?: Iterable<string>;
  reservations?: readonly Reservation[];
}): FittedDates | null {
  if (!(minutes > 0)) return null;
  const earliest = now.getTime();
  const horizon = earliest + FIT_HORIZON_DAYS * DAY_MS;
  const calendar = uniformCalendarWithDaysOff(timeZone, blockedDays);
  const reserved = reservations
    .map((reservation) => ({
      start: Math.max(reservation.start.getTime(), earliest),
      end: Math.min(reservation.end.getTime(), horizon),
    }))
    .filter((interval) => interval.start < interval.end)
    .map((interval) => ({
      start: new Date(interval.start).toISOString(),
      end: new Date(interval.end).toISOString(),
    }));
  const fitted = fitWork(
    createCalendarReader({
      ...calendar,
      timeOff: [...calendar.timeOff, ...reserved],
    }),
    earliest,
    minutes * 60_000,
    [],
    horizon,
  );
  if (!fitted?.length) return null;
  return {
    startDate: new Date(fitted[0]!.start),
    dueDate: new Date(fitted.at(-1)!.end),
  };
}
