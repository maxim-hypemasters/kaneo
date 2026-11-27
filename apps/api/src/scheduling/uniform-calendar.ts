import { timeOffInterval } from "./approved-time-off-calendars";
import { coalesceDays } from "./coalesce-days";
import type { PlanningCalendar } from "./engine/types";

// Release planning gives every assignee Monday–Friday, 09:00–17:00 in the
// project's planning timezone.
export function uniformPlanningCalendar(
  assigneeId: string,
  timeZone: string,
): PlanningCalendar {
  return {
    assigneeId,
    timeZone,
    weeklyIntervals: [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      startMinute: 540,
      endMinute: 1020,
    })),
    timeOff: [],
  };
}

// The uniform calendar of one unnamed assignee with `blockedDays` (local
// YYYY-MM-DD days, any order) taken off whole, as Apply skips days away.
export function uniformCalendarWithDaysOff(
  timeZone: string,
  blockedDays: Iterable<string>,
): PlanningCalendar {
  return {
    ...uniformPlanningCalendar("", timeZone),
    // A run made only of skipped civil dates has no interval to block.
    timeOff: coalesceDays(blockedDays)
      .map((range) => timeOffInterval(range, timeZone))
      .filter((interval) => interval.start < interval.end),
  };
}
