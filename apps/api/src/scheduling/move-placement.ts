import { createCalendarReader, fitWork } from "./engine/calendar";
import { uniformCalendarWithDaysOff } from "./uniform-calendar";

// The planner's own horizon (see build-schedule).
export const MOVE_HORIZON_DAYS = 3660;
const HORIZON_MS = MOVE_HORIZON_DAYS * 86_400_000;

export type TaskPlacement = {
  startDate: Date | null;
  dueDate: Date | null;
  scheduleSegments: Array<{ start: string; end: string }> | null;
};

// Moves a Task/Bug on the schedule. Planned work keeps its remaining planned
// effort and is laid out again through working hours from `start`, so it may
// finish later than `end` (nights and weekends are skipped). Unplanned work
// takes the requested span on the date fields it already has. Returns null
// when the work no longer fits within the planning horizon.
//
// `exact` is a span set by hand (resizing a bar): the work takes both dates
// as given and stops following its estimate, so its planned segments go.
//
// `blockedDays` (local YYYY-MM-DD days) are skipped whole when planned work
// is laid out again, as Apply skips the assignee's days away. Hand-set spans
// and unplanned work ignore them.
export function movePlacement(
  task: TaskPlacement,
  target: { start: Date; end: Date },
  timeZone: string,
  exact = false,
  blockedDays: Iterable<string> = [],
): TaskPlacement | null {
  if (exact)
    return {
      startDate: target.start,
      dueDate: target.end,
      scheduleSegments: null,
    };
  const segments = task.scheduleSegments;
  if (!segments?.length)
    return {
      startDate: task.startDate ? target.start : null,
      dueDate: task.dueDate ? target.end : null,
      scheduleSegments: segments,
    };
  const effort = segments.reduce(
    (total, segment) =>
      total + Date.parse(segment.end) - Date.parse(segment.start),
    0,
  );
  const earliest = target.start.getTime();
  const fitted = fitWork(
    createCalendarReader(uniformCalendarWithDaysOff(timeZone, blockedDays)),
    earliest,
    effort,
    [],
    earliest + HORIZON_MS,
  );
  if (!fitted?.length) return null;
  return {
    startDate: new Date(fitted[0]!.start),
    dueDate: new Date(fitted.at(-1)!.end),
    scheduleSegments: fitted.map((segment) => ({
      start: new Date(segment.start).toISOString(),
      end: new Date(segment.end).toISOString(),
    })),
  };
}
