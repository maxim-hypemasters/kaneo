import type { ScheduledMilestone, ScheduledTask } from "./gantt-types";
import { getBarGridColumns, type GanttTimeline } from "./timeline";

// Disjoint date spans share the lead's row. Overlapping milestones get
// separate tracks so every bar keeps its own open, drag and resize targets.
export function assigneeMilestoneTracks(
  tasks: readonly ScheduledTask[],
  timeline: Pick<GanttTimeline, "rangeStart" | "days">,
  isMobile: boolean,
): ScheduledMilestone[][] {
  const milestones = tasks
    .filter(
      (task): task is ScheduledMilestone => task.entityKind === "milestone",
    )
    .filter(
      (task) =>
        getBarGridColumns(
          task.scheduleStart,
          task.scheduleEnd,
          timeline.rangeStart,
          timeline.days.length,
        ).barInView,
    )
    .sort(
      (left, right) =>
        left.scheduleStart.getTime() - right.scheduleStart.getTime() ||
        left.scheduleEnd.getTime() - right.scheduleEnd.getTime() ||
        left.id.localeCompare(right.id),
    );
  const tracks: ScheduledMilestone[][] = [];
  for (const milestone of milestones) {
    // Phone labels may extend beyond short bars. Give each its own track.
    const track = isMobile
      ? undefined
      : tracks.find(
          (items) =>
            items[items.length - 1]!.scheduleEnd < milestone.scheduleStart,
        );
    if (track) track.push(milestone);
    else tracks.push([milestone]);
  }
  return tracks;
}
