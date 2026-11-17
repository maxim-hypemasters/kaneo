import { cn } from "@/lib/cn";
import type { AwayRun } from "./away-runs";
import { GANTT_AWAY_STYLES } from "./away-style";

// A thin strip along a bar's bottom edge under each day away it covers.
// Grid items of the bar's own row grid, so they line up with the day
// columns; the bar's description says the same in words.
export function GanttAwayMarks({ runs }: { runs: readonly AwayRun[] }) {
  return runs.map((run) => (
    <span
      key={run.from}
      aria-hidden="true"
      data-gantt-away-mark={run.kind}
      className={cn(
        "pointer-events-none relative z-[11] mx-0.5 mb-1.5 h-1 self-end rounded-full forced-colors:bg-[CanvasText]",
        GANTT_AWAY_STYLES[run.kind].markClassName,
      )}
      style={{ gridColumn: `${run.from + 1} / ${run.to + 1}`, gridRow: 1 }}
    />
  ));
}
