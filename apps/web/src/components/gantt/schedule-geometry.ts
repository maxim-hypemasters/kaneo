import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";

export function lastScheduledInstant(start: Date, end: Date) {
  // Work intervals are end-exclusive, including when they finish at midnight.
  return end > start ? new Date(end.getTime() - 1) : end;
}

// Each local calendar day has the same visual width, including 23/25-hour
// DST days. Within a day, elapsed time maps monotonically across repeated hours.
export function scheduleDayPosition(date: Date, rangeStart: Date) {
  const day = startOfDay(date);
  const next = addDays(day, 1);
  return (
    differenceInCalendarDays(day, rangeStart) +
    (date.getTime() - day.getTime()) / (next.getTime() - day.getTime())
  );
}
export function scheduleSegmentGeometry(
  start: Date,
  end: Date,
  rangeStart: Date,
  dayCount: number,
) {
  const from = scheduleDayPosition(start, rangeStart);
  const to = scheduleDayPosition(end, rangeStart);
  const left = Math.max(0, from);
  const right = Math.min(dayCount, to);
  return right > left
    ? {
        left,
        width: right - left,
        clippedStart: from < 0,
        clippedEnd: to > dayCount,
      }
    : null;
}
