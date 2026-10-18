import { RELEASE_DATE_KINDS } from "@/components/releases/release-date-kinds";
import { cn } from "@/lib/cn";
import type { ReleaseMarkerDay } from "./release-marker-days";
import type { GanttTimeline } from "./timeline";

// Lines several dates on one day are spread by, so each stays visible.
const LINE_SPACING_PX = 6;

type GanttReleaseMarkersProps = {
  days: readonly ReleaseMarkerDay[];
  timeline: GanttTimeline;
  // Where the timeline starts, right of the task rail.
  left: string;
};

// Full-height lines at release dates, behind the bars. The line style tells
// the kinds apart without colour (start dotted, code freeze dashed,
// submission solid); the label strip in the header names them.
export function GanttReleaseMarkers({
  days,
  timeline,
  left,
}: GanttReleaseMarkersProps) {
  return (
    <div
      aria-hidden="true"
      data-gantt-release-markers=""
      className="pointer-events-none absolute inset-y-0 z-0 grid"
      style={{
        left,
        gridTemplateColumns: timeline.gridTemplateColumns,
        width: `${timeline.timelineMinWidthRem}rem`,
      }}
    >
      {days.map((day) => {
        const lines = day.releases.flatMap((release) =>
          release.kinds.map((kind) => ({ releaseId: release.id, kind })),
        );
        return (
          <div
            key={day.date}
            className="relative"
            style={{ gridColumn: day.index + 1, gridRow: 1 }}
          >
            {lines.map((line, position) => (
              <span
                key={`${line.releaseId}:${line.kind}`}
                data-release-line={line.kind}
                className={cn(
                  "absolute inset-y-0 left-1/2 border-l-2",
                  RELEASE_DATE_KINDS[line.kind].lineClassName,
                )}
                style={{
                  transform: `translateX(calc(-50% + ${
                    (position - (lines.length - 1) / 2) * LINE_SPACING_PX
                  }px))`,
                }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
