import type { ScheduledMilestone, ScheduledTask } from "./gantt-types";
import { getBarGridColumns, type GanttTimeline } from "./timeline";

// Milestones whose drawn columns don't overlap share the lead's row.
// Overlapping milestones get separate tracks so every bar keeps its own open,
// drag and resize targets. Packing goes by columns, not dates: with weekends
// hidden a weekend-only milestone is drawn on the next working day.
export function assigneeMilestoneTracks(
  tasks: readonly ScheduledTask[],
  timeline: Pick<GanttTimeline, "rangeStart" | "days" | "hideWeekends">,
  isMobile: boolean,
): ScheduledMilestone[][] {
  const placed = tasks
    .filter(
      (task): task is ScheduledMilestone => task.entityKind === "milestone",
    )
    .map((milestone) => ({
      milestone,
      ...getBarGridColumns(
        milestone.scheduleStart,
        milestone.scheduleEnd,
        timeline.rangeStart,
        timeline.days.length,
        timeline.hideWeekends,
      ),
    }))
    .filter(({ barInView }) => barInView)
    .sort(
      ({ milestone: left }, { milestone: right }) =>
        left.scheduleStart.getTime() - right.scheduleStart.getTime() ||
        left.scheduleEnd.getTime() - right.scheduleEnd.getTime() ||
        left.id.localeCompare(right.id),
    );
  const tracks: { lineEnd: number; items: ScheduledMilestone[] }[] = [];
  for (const { milestone, lineStart, lineEnd } of placed) {
    // Phone labels may extend beyond short bars. Give each its own track.
    const track = isMobile
      ? undefined
      : tracks.find((candidate) => candidate.lineEnd <= lineStart);
    if (track) {
      track.items.push(milestone);
      track.lineEnd = lineEnd;
    } else tracks.push({ lineEnd, items: [milestone] });
  }
  return tracks.map((track) => track.items);
}
