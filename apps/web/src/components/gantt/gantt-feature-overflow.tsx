import { format } from "date-fns";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { GanttFeatureSpan } from "./gantt-types";

type GanttFeatureOverflowProps = {
  features: readonly GanttFeatureSpan[];
  // Grid placement inside the lane header's last feature track: the days
  // these features cover between them.
  gridColumn: string;
  // How far from the scroller's left edge the chip stops, clear of the
  // sticky task rail that paints over the timeline.
  stickyLeftRem: number;
  onOpenFeature: (featureId: string) => void;
};

// The "+N" chip for overlapping features that found no free track; it lists
// them so each one can still be opened from the chart. The chip sticks to
// the left edge of the timeline inside a box spanning their days, so it stays
// on screen while any of them is. The box passes clicks through to the
// slices under it.
export function GanttFeatureOverflow({
  features,
  gridColumn,
  stickyLeftRem,
  onOpenFeature,
}: GanttFeatureOverflowProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const count = features.length;

  return (
    <div
      data-gantt-feature-overflow=""
      style={{ gridColumn }}
      className="pointer-events-none row-start-1 flex min-w-0"
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label={t("tasks:gantt.featureOverflowAria", { count })}
          style={{ left: `${stickyLeftRem + 0.125}rem` }}
          className="pointer-events-auto sticky ml-0.5 flex h-full min-w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border bg-background px-1.5 text-[11px] font-medium tabular-nums leading-none text-muted-foreground shadow-xs transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("tasks:gantt.featureOverflow", { count })}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-label={t("tasks:gantt.featureOverflowAria", { count })}
          className="w-64 p-1"
        >
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {features.map((feature) => {
              const start = format(feature.start, "MMM d, yyyy");
              const end = format(feature.end, "MMM d, yyyy");
              return (
                <button
                  key={feature.featureId}
                  type="button"
                  aria-label={t("tasks:gantt.featureSliceAria", {
                    title: feature.title,
                    count: feature.taskCount,
                    start,
                    end,
                  })}
                  onClick={() => {
                    setOpen(false);
                    onOpenFeature(feature.featureId);
                  }}
                  className="flex w-full min-w-0 flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="w-full truncate text-xs font-medium text-foreground">
                    {feature.title}
                  </span>
                  <span className="w-full truncate text-[11px] text-muted-foreground">
                    {start} – {end}
                  </span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
