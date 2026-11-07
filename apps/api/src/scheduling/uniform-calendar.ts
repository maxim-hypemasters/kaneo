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
