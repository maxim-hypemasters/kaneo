import { cn } from "@/lib/cn";
import { type GanttTimeline, getBarGridColumns } from "./timeline";

type GanttLaneSummaryLineProps = {
  // Earliest start and latest end of the lane's tasks.
  start: Date | null;
  end: Date | null;
  timeline: Pick<GanttTimeline, "days" | "rangeStart" | "gridTemplateColumns">;
};

// A lane's work at a glance, along the bottom of its header: earliest start
// to latest end, clipped to the visible window like a task bar. Thin, so the
// bars above it stay the header's main read.
export function GanttLaneSummaryLine({
  start,
  end,
  timeline,
}: GanttLaneSummaryLineProps) {
  if (!start || !end) return null;
  const summary = getBarGridColumns(
    start,
    end,
    timeline.rangeStart,
    timeline.days.length,
  );
  if (!summary.barInView) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-1 grid"
      style={{ gridTemplateColumns: timeline.gridTemplateColumns }}
    >
      <div
        data-testid="gantt-lane-summary"
        style={{ gridColumn: `${summary.lineStart} / ${summary.lineEnd}` }}
        className={cn(
          "h-1 bg-primary/45 forced-color-adjust-none forced-colors:bg-[CanvasText]",
          summary.clippedStart ? "rounded-l-none" : "ml-1 rounded-l-full",
          summary.clippedEnd ? "rounded-r-none" : "mr-1 rounded-r-full",
        )}
      />
    </div>
  );
}
