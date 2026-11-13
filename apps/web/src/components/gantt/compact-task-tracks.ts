import { startOfDay } from "date-fns";
import type { ScheduledTask } from "./gantt-types";
import { lastScheduledInstant } from "./schedule-geometry";

// The last calendar day the task's bar covers. Planned work ends at an
// exclusive instant; other bars end on a day.
function lastBarDay(task: ScheduledTask) {
  const plannedWork = task.entityKind !== "milestone" && task.scheduleApplied;
  return startOfDay(
    plannedWork
      ? lastScheduledInstant(task.scheduleStart, task.scheduleEnd)
      : task.scheduleEnd,
  ).getTime();
}

// Compact rows: tasks whose bars cover no common day share a track. Packing
// ignores the rendered range, so tracks hold still while the range grows.
export function compactTaskTracks(
  tasks: readonly ScheduledTask[],
  isMobile: boolean,
): ScheduledTask[][] {
  const sorted = [...tasks].sort(
    (left, right) =>
      left.scheduleStart.getTime() - right.scheduleStart.getTime() ||
      left.scheduleEnd.getTime() - right.scheduleEnd.getTime() ||
      left.id.localeCompare(right.id),
  );
  const tracks: { tasks: ScheduledTask[]; lastDay: number }[] = [];
  for (const task of sorted) {
    const firstDay = startOfDay(task.scheduleStart).getTime();
    // Phone labels may extend beyond short bars. Give each its own track.
    const track = isMobile
      ? undefined
      : tracks.find((candidate) => candidate.lastDay < firstDay);
    if (track) {
      track.tasks.push(task);
      track.lastDay = lastBarDay(task);
    } else {
      tracks.push({ tasks: [task], lastDay: lastBarDay(task) });
    }
  }
  return tracks.map((track) => track.tasks);
}
