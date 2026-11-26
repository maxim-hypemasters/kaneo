import { addDays } from "date-fns";
import { extendGanttRange, type GanttRange } from "./timeline";
import { columnDay, dayColumn } from "./weekend-columns";

export const GANTT_MIN_DAY_WIDTH_REM = 2;
export const GANTT_MAX_DAY_WIDTH_REM = 24;

// Bound a single frame, including page-mode wheels, without quantizing
// smaller trackpad deltas into fixed zoom levels.
export function zoomedDayWidth(current: number, deltaPx: number) {
  if (!Number.isFinite(deltaPx)) return current;
  const delta = Math.max(-120, Math.min(deltaPx, 120));
  return Math.max(
    GANTT_MIN_DAY_WIDTH_REM,
    Math.min(GANTT_MAX_DAY_WIDTH_REM, current * Math.exp(-delta * 0.002)),
  );
}

export type GanttZoomAnchor = { day: Date; fraction: number };

export function ganttZoomAnchor(
  rangeStart: Date,
  scrollLeft: number,
  pointerOffsetPx: number,
  dayPx: number,
  hideWeekends = false,
): GanttZoomAnchor {
  const index = (scrollLeft + pointerOffsetPx) / dayPx;
  const wholeDays = Math.floor(index);
  return {
    day: columnDay(rangeStart, wholeDays, hideWeekends),
    fraction: index - wholeDays,
  };
}

export function scrollLeftForZoomAnchor(
  anchor: GanttZoomAnchor,
  rangeStart: Date,
  pointerOffsetPx: number,
  dayPx: number,
  hideWeekends = false,
) {
  // Calendar-day differences keep the same date under the pointer across
  // DST boundaries; a day is not always 24 elapsed hours.
  return (
    (dayColumn(anchor.day, rangeStart, hideWeekends) + anchor.fraction) *
      dayPx -
    pointerOffsetPx
  );
}

// Expand before the smaller columns reach the DOM. Otherwise the browser
// can clamp scrollLeft at the old range's new end and lose the pointer date.
export function rangeForZoomAnchor(
  current: GanttRange,
  anchor: GanttZoomAnchor,
  pointerOffsetPx: number,
  dayPx: number,
  visiblePx: number,
  maxDays: number,
  hideWeekends = false,
) {
  let range = current;
  while (true) {
    const left = scrollLeftForZoomAnchor(
      anchor,
      range.start,
      pointerOffsetPx,
      dayPx,
      hideWeekends,
    );
    const dayCount = dayColumn(addDays(range.end, 1), range.start, hideWeekends);
    const maxLeft = Math.max(0, dayCount * dayPx - visiblePx);
    const side = left < 0 ? "start" : left > maxLeft ? "end" : null;
    if (!side) return range;
    const grown = extendGanttRange(range, side, maxDays);
    if (!grown) return range;
    range = grown.range;
  }
}
