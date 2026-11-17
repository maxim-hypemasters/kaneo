import type { PlanningCalendar } from "./engine/types";
import { addDays, startOfLocalDay } from "./engine/zoned-time";

// An approved leave as inclusive local days (YYYY-MM-DD).
export type ApprovedTimeOff = {
  userId: string;
  startDate: string;
  endDate: string;
};

// Whole local days in the calendar's timezone: from the start of the first
// day to the start of the day after the last. A range made only of skipped
// civil dates comes back empty (start equals end).
export function timeOffInterval(
  range: Pick<ApprovedTimeOff, "startDate" | "endDate">,
  timeZone: string,
) {
  return {
    start: new Date(startOfLocalDay(range.startDate, timeZone)).toISOString(),
    end: new Date(
      startOfLocalDay(addDays(range.endDate, 1), timeZone),
    ).toISOString(),
  };
}

// Adds each member's approved time off and calendar public holidays (runs of
// consecutive days) to their calendar's own time off, as whole days in the
// calendar's time zone. Returns the same array when there is nothing to add,
// and the same calendar for members with nothing to add.
export function withApprovedTimeOff(
  calendars: PlanningCalendar[],
  ranges: ApprovedTimeOff[],
) {
  if (!ranges.length) return calendars;
  const byUser = new Map<string, ApprovedTimeOff[]>();
  for (const range of ranges)
    byUser.set(range.userId, [...(byUser.get(range.userId) ?? []), range]);
  return calendars.map((calendar) => {
    const own = byUser.get(calendar.assigneeId);
    if (!own) return calendar;
    const intervals = own
      .map((range) => timeOffInterval(range, calendar.timeZone))
      .filter((interval) => interval.start < interval.end);
    return intervals.length
      ? { ...calendar, timeOff: [...calendar.timeOff, ...intervals] }
      : calendar;
  });
}
