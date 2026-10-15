import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { type GanttViewportStore, useGanttViewport } from "./gantt-viewport";
import {
  GANTT_FIRST_DAY,
  GANTT_LAST_DAY,
  type GanttTimeline,
  parseTaskDate,
} from "./timeline";

type GanttPeriodControlsProps = {
  timeline: GanttTimeline;
  viewport: GanttViewportStore;
  onGoToDate: (date: Date) => void;
  onPage: (direction: -1 | 1) => void;
};

// Arrows page through the timeline by scrolling it, and the date field both
// shows and sets the first visible day. Subscribes to the visible days on
// its own, so only it re-renders while the timeline scrolls.
export function GanttPeriodControls({
  timeline,
  viewport,
  onGoToDate,
  onPage,
}: GanttPeriodControlsProps) {
  const { t } = useTranslation();
  const firstTime = useGanttViewport(
    viewport,
    (visible) => visible?.first.getTime() ?? null,
  );
  const lastTime = useGanttViewport(
    viewport,
    (visible) => visible?.last.getTime() ?? null,
  );
  // Without a measured viewport (nothing laid out yet) the rendered span is
  // the best answer.
  const firstDay =
    firstTime === null ? timeline.rangeStart : new Date(firstTime);
  const lastDay = lastTime === null ? timeline.rangeEnd : new Date(lastTime);

  return (
    <>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={t("tasks:gantt.previousPeriod")}
        disabled={!timeline.hasPrevious && firstDay <= timeline.rangeStart}
        onClick={() => onPage(-1)}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <input
        type="date"
        aria-label={t("tasks:gantt.periodStart")}
        className="h-9 min-w-0 rounded-md border border-border bg-background px-2 text-base sm:h-8 sm:text-sm"
        min={format(GANTT_FIRST_DAY, "yyyy-MM-dd")}
        max={format(GANTT_LAST_DAY, "yyyy-MM-dd")}
        value={format(firstDay, "yyyy-MM-dd")}
        onChange={(event) => {
          const date = parseTaskDate(event.target.value);
          if (date) onGoToDate(date);
        }}
      />
      <span className="hidden text-xs text-muted-foreground sm:inline">
        – {format(lastDay, "MMM d, yyyy")}
      </span>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={t("tasks:gantt.nextPeriod")}
        disabled={!timeline.hasNext && lastDay >= timeline.rangeEnd}
        onClick={() => onPage(1)}
      >
        <ChevronRight className="size-4" />
      </Button>
    </>
  );
}
