import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { useReleaseToday } from "@/lib/releases/use-release-today";
import type { GanttTimeline } from "../timeline";
import { awayNoteDates } from "./away-note";
import type { AwayRun } from "./away-runs";
import { GANTT_AWAY_STYLES } from "./away-style";

type GanttAwayBandsProps = {
  runs: readonly AwayRun[];
  // The lane's member.
  name: string;
  timeline: GanttTimeline;
  // Where the timeline starts, right of the task rail.
  left: string;
};

// An assignee lane's days away, as bands behind its bars. Rendered last in
// the lane with no z-index, so they paint over the lane's rows but under
// its bars, and let the pointer through to the lane beneath.
export function GanttAwayBands({
  runs,
  name,
  timeline,
  left,
}: GanttAwayBandsProps) {
  const { t } = useTranslation();
  const today = useReleaseToday();
  if (runs.length === 0) return null;
  const labelOf = (run: AwayRun) =>
    run.name ?? t(GANTT_AWAY_STYLES[run.kind].labelKey);

  return (
    <>
      <div
        aria-hidden="true"
        data-gantt-away-bands=""
        className="pointer-events-none absolute inset-y-0 grid"
        style={{
          left,
          gridTemplateColumns: timeline.gridTemplateColumns,
          width: `${timeline.timelineMinWidthRem}rem`,
        }}
      >
        {runs.map((run) => {
          const style = GANTT_AWAY_STYLES[run.kind];
          const Icon = style.icon;
          return (
            <div
              key={run.from}
              data-gantt-away-band={run.kind}
              className={cn(
                "h-full min-w-0 overflow-hidden border-x",
                style.bandClassName,
              )}
              style={{
                gridColumn: `${run.from + 1} / ${run.to + 1}`,
                gridRow: 1,
              }}
            >
              <span className="flex min-w-0 items-center gap-0.5 px-1 pt-0.5 text-[10px] font-medium">
                {Icon ? <Icon className="size-2.5 shrink-0" /> : null}
                <span className="truncate">{labelOf(run)}</span>
              </span>
            </div>
          );
        })}
      </div>
      <p className="sr-only">
        {t("tasks:gantt.away.laneSummary", {
          name,
          dates: awayNoteDates(runs, timeline.rangeStart, today, labelOf),
        })}
      </p>
    </>
  );
}
