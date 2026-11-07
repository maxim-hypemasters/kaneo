import { differenceInCalendarDays } from "date-fns";

export function lastScheduledInstant(start: Date, end: Date) {
  // Work intervals are end-exclusive, including when they finish at midnight.
  return end > start ? new Date(end.getTime() - 1) : end;
}

export type ScheduleDayBlock = { from: number; to: number };

// Planned work fills every local calendar day it has work on, so a two-hour
// task still reads as a full card; the exact hours stay in its description.
// Consecutive days merge into one block, while days without work (a weekend,
// time off) stay gaps. Blocks are 0-based, end-exclusive day indexes from
// rangeStart, clipped to the rendered days.
export function scheduleDayBlocks(
  segments: readonly { start: Date; end: Date }[],
  rangeStart: Date,
  dayCount: number,
) {
  const days = segments
    .map(({ start, end }) => ({
      from: differenceInCalendarDays(start, rangeStart),
      to:
        differenceInCalendarDays(lastScheduledInstant(start, end), rangeStart) +
        1,
    }))
    .sort((left, right) => left.from - right.from);
  const blocks: ScheduleDayBlock[] = [];
  for (const day of days) {
    const last = blocks.at(-1);
    if (last && day.from <= last.to) last.to = Math.max(last.to, day.to);
    else blocks.push({ ...day });
  }
  return blocks.flatMap(({ from, to }) => {
    const visibleFrom = Math.max(0, from);
    const visibleTo = Math.min(dayCount, to);
    return visibleTo > visibleFrom
      ? [{ from: visibleFrom, to: visibleTo }]
      : [];
  });
}
