import { differenceInCalendarDays } from "date-fns";
import { useId, useLayoutEffect, useRef, useState } from "react";
import {
  type GanttDependency,
  type GanttSpan,
  isDependencyBroken,
} from "./gantt-dependencies";
import { dependencyPath } from "./gantt-dependency-path";
import { remToPx } from "./gantt-scroll";
import type { GanttTimeline } from "./timeline";

// Bars sit 4px (mx-1) inside their day columns.
const BAR_INSET_PX = 4;

type GanttDependencyLinesProps = {
  dependencies: readonly GanttDependency[];
  spans: ReadonlyMap<string, GanttSpan>;
  timeline: GanttTimeline;
  dayColumnWidthRem: number;
  railWidthRem: number;
  // Changes whenever rows are added, removed or reordered, so their
  // positions are measured again.
  layoutKey: string;
  // A bar being dragged shows its new dates only inside itself until it is
  // dropped, so its lines fade instead of pointing at where it was.
  draggingTaskId?: string | null;
};

type RowBox = { centre: number; half: number };

function sameRows(
  left: ReadonlyMap<string, RowBox>,
  right: ReadonlyMap<string, RowBox>,
) {
  if (left.size !== right.size) return false;
  for (const [id, box] of left) {
    const other = right.get(id);
    if (other?.centre !== box.centre || other.half !== box.half) return false;
  }
  return true;
}

// Draws "blocks" dependencies as arrows from the end of the blocking bar to
// the start of the blocked one, red and dashed when the blocked task starts
// before its blocker ends. Sits inside the lanes container, so it scrolls with
// the rows, and measures the rendered rows ([data-gantt-row]) for the vertical
// positions; tasks that aren't rendered (filtered out, collapsed, unscheduled)
// get no line. At z-[1] and first in the container, the arrows draw over lane
// headers and their feature bands but under the bars (z-[1], later in the
// DOM), the sticky name chips (z-[2]), a dragged bar (z-[10]) and the task
// rail (z-[11]). Click-through, so everything under them stays clickable.
export function GanttDependencyLines({
  dependencies,
  spans,
  timeline,
  dayColumnWidthRem,
  railWidthRem,
  layoutKey,
  draggingTaskId = null,
}: GanttDependencyLinesProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const markerId = `gantt-dep-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [rows, setRows] = useState<ReadonlyMap<string, RowBox>>(
    () => new Map(),
  );

  // layoutKey is the trigger: rows moved, so measure them again.
  useLayoutEffect(() => {
    const container = svgRef.current?.parentElement;
    if (!container) return;
    const measure = () => {
      const top = container.getBoundingClientRect().top;
      const next = new Map<string, RowBox>();
      for (const row of container.querySelectorAll<HTMLElement>(
        "[data-gantt-row]",
      )) {
        const rect = row.getBoundingClientRect();
        const id = row.dataset.ganttRow;
        if (id) {
          next.set(id, {
            centre: rect.top - top + rect.height / 2,
            half: rect.height / 2,
          });
        }
      }
      setRows((current) => (sameRows(current, next) ? current : next));
    };
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [layoutKey]);

  const dayPx = remToPx(dayColumnWidthRem);
  const railPx = remToPx(railWidthRem);
  const xOf = (date: Date, edge: "start" | "end") => {
    const index = differenceInCalendarDays(date, timeline.rangeStart);
    return edge === "start"
      ? railPx + index * dayPx + BAR_INSET_PX
      : railPx + (index + 1) * dayPx - BAR_INSET_PX;
  };

  const lines = dependencies.flatMap((dependency) => {
    const blocker = spans.get(dependency.blockerId);
    const blocked = spans.get(dependency.blockedId);
    const fromRow = rows.get(dependency.blockerId);
    const toRow = rows.get(dependency.blockedId);
    if (!blocker || !blocked || !fromRow || !toRow) return [];
    return [
      {
        id: dependency.id,
        broken: isDependencyBroken(blocker, blocked),
        faded:
          draggingTaskId !== null &&
          (dependency.blockerId === draggingTaskId ||
            dependency.blockedId === draggingTaskId),
        d: dependencyPath(
          { x: xOf(blocker.end, "end"), y: fromRow.centre },
          { x: xOf(blocked.start, "start"), y: toRow.centre },
          toRow.half,
        ),
      },
    ];
  });

  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      data-testid="gantt-dependency-lines"
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full overflow-hidden"
    >
      <defs>
        {(["ok", "broken"] as const).map((state) => (
          <marker
            key={state}
            id={`${markerId}-${state}`}
            viewBox="0 0 6 6"
            refX="5"
            refY="3"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path
              d="M 0 0 L 6 3 L 0 6 z"
              className={
                state === "broken"
                  ? "fill-destructive"
                  : "fill-muted-foreground/70"
              }
            />
          </marker>
        ))}
      </defs>
      {lines.map((line) => (
        <path
          key={line.id}
          d={line.d}
          data-broken={line.broken ? "" : undefined}
          fill="none"
          // Dashed as well as red, so a broken dependency doesn't rely on
          // colour alone.
          strokeWidth={line.broken ? 2 : 1.5}
          strokeDasharray={line.broken ? "4 3" : undefined}
          opacity={line.faded ? 0.25 : undefined}
          markerEnd={`url(#${markerId}-${line.broken ? "broken" : "ok"})`}
          className={
            line.broken ? "stroke-destructive" : "stroke-muted-foreground/70"
          }
        />
      ))}
    </svg>
  );
}
