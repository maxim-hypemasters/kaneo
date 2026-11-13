import { subDays } from "date-fns";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useGanttRange } from "@/components/gantt/use-gantt-range";
import { useDragToPan } from "@/components/gantt/use-drag-to-pan";
import { useWheelZoomsTime } from "@/components/gantt/use-wheel-zooms-time";
import { useIsMobile } from "@/hooks/use-mobile";
import { parseReleaseDate } from "@/lib/releases/release-date";
import type { Release } from "@/types/release";
import type { PreviewWork } from "./preview-model";
import {
  usePreviewTaskFocus,
  type PreviewTaskFocusRequest,
} from "./use-preview-task-focus";

export function usePreviewTimeline(
  projectId: string,
  tasks: PreviewWork[],
  release: Release,
  focusRequest?: PreviewTaskFocusRequest,
) {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  );
  const isMobile = useIsMobile();
  const releaseSpan = useMemo(
    () => ({
      projectId,
      scheduleStart: parseReleaseDate(release.startDate),
      scheduleEnd: parseReleaseDate(release.submissionDate),
    }),
    [projectId, release.startDate, release.submissionDate],
  );
  const records = useMemo(
    () => (tasks.length ? tasks : [releaseSpan]),
    [tasks, releaseSpan],
  );
  const releaseSpans = useMemo(() => [releaseSpan], [releaseSpan]);
  const range = useGanttRange({
    projectId,
    tasks: records,
    extraSpans: releaseSpans,
    ready: true,
    showEmptyTimeline: true,
    weekStartsOn: 1,
    dayColumnWidthRem: isMobile ? 2.25 : 2.5,
    railWidthRem: 0,
    scrollElement,
  });
  const first =
    tasks.reduce<Date | null>(
      (date, task) =>
        !date || task.scheduleStart < date ? task.scheduleStart : date,
      null,
    ) ?? releaseSpan.scheduleStart;
  const initialized = useRef(false);
  const { timeline, scrollToDate } = range;
  useLayoutEffect(() => {
    if (!scrollElement || !timeline || initialized.current) return;
    initialized.current = true;
    scrollToDate(subDays(first, 1), "start", "auto");
  }, [scrollElement, timeline, scrollToDate, first]);
  usePreviewTaskFocus({
    request: focusRequest,
    tasks,
    element: scrollElement,
    ready: Boolean(timeline),
    scrollToDate,
  });
  useWheelZoomsTime(scrollElement, {
    onZoom: range.zoomAt,
  });
  const pan = useDragToPan();
  return {
    ...range,
    setScrollElement,
    pan,
  };
}
