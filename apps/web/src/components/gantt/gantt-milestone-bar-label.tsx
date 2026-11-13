import { ProgressDiamond } from "@/components/shared/progress-diamond";
import { cn } from "@/lib/cn";
import type { GanttMilestoneRecord } from "./gantt-types";

type GanttMilestoneBarLabelProps = {
  title: string;
  counts: GanttMilestoneRecord["progress"] | undefined;
  // The done/total count of the milestone's tasks, e.g. "3/5"; null when it
  // has none.
  progress: string | null;
  // A short phone bar draws its title after itself instead, so the band
  // keeps just the icon.
  textOutside: boolean;
};

// What a milestone's summary bar shows on its violet band. The bar's button is
// named by its aria-label, so the count here is visual only.
//
// The label sticks just past the task rail while the bar scrolls under it,
// so the diamond and title stay in view; being sticky, it never leaves the
// bar. The scroll container sets --gantt-rail-width.
export function GanttMilestoneBarLabel({
  title,
  counts,
  progress,
  textOutside,
}: GanttMilestoneBarLabelProps) {
  const ratio =
    counts && counts.total > 0 ? counts.completed / counts.total : 0;
  return (
    <span className="sticky left-[calc(var(--gantt-rail-width,0rem)+0.5rem)] z-10 flex min-w-0 items-center gap-1.5 text-xs leading-none text-milestone-foreground sm:left-[calc(var(--gantt-rail-width,0rem)+0.625rem)]">
      {/* Coloured as on release pages, in tones that read on the band. */}
      <ProgressDiamond
        ratio={ratio}
        className={cn(
          "size-3.5 shrink-0",
          ratio < 1 && counts && counts.started > 0 && "text-amber-300",
        )}
      />
      <span
        className={cn(
          "min-w-0 truncate font-semibold leading-tight",
          textOutside && "sr-only",
        )}
      >
        {title}
      </span>
      {progress && !textOutside ? (
        <span
          aria-hidden="true"
          className="shrink-0 font-medium tabular-nums text-milestone-foreground/75"
        >
          {progress}
        </span>
      ) : null}
    </span>
  );
}
