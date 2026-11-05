import type { PlanningCalendar } from "./types";
import {
  addDays,
  localDate,
  localInterval,
  type TimeInterval,
} from "./zoned-time";

export function mergeIntervals(intervals: TimeInterval[]) {
  const result: TimeInterval[] = [];
  for (const item of [...intervals].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  )) {
    const previous = result.at(-1);
    if (previous && item.start <= previous.end)
      previous.end = Math.max(previous.end, item.end);
    else result.push({ ...item });
  }
  return result;
}

function subtractTimeOff(intervals: TimeInterval[], timeOff: TimeInterval[]) {
  return intervals.flatMap((interval) => {
    let remaining = [interval];
    for (const absence of timeOff) {
      remaining = remaining.flatMap((part) => {
        if (absence.end <= part.start || absence.start >= part.end)
          return [part];
        const parts: TimeInterval[] = [];
        if (absence.start > part.start)
          parts.push({ start: part.start, end: absence.start });
        if (absence.end < part.end)
          parts.push({ start: absence.end, end: part.end });
        return parts;
      });
    }
    return remaining;
  });
}

export function createCalendarReader(calendar: PlanningCalendar) {
  const days = new Map<string, TimeInterval[]>();
  const timeOff = mergeIntervals(
    calendar.timeOff.map((item) => ({
      start: Date.parse(item.start),
      end: Date.parse(item.end),
    })),
  );
  return function intervalsBetween(start: number, end: number) {
    const intervals: TimeInterval[] = [];
    let day = localDate(start, calendar.timeZone);
    const lastDay = localDate(end, calendar.timeZone);
    while (day <= lastDay) {
      let work = days.get(day);
      if (!work) {
        const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
        work = subtractTimeOff(
          mergeIntervals(
            calendar.weeklyIntervals
              .filter((item) => item.weekday === weekday)
              .flatMap((item) =>
                localInterval(
                  day,
                  item.startMinute,
                  item.endMinute,
                  calendar.timeZone,
                ),
              ),
          ),
          timeOff,
        );
        days.set(day, work);
      }
      for (const interval of work) {
        const clipped = {
          start: Math.max(start, interval.start),
          end: Math.min(end, interval.end),
        };
        if (clipped.start < clipped.end) intervals.push(clipped);
      }
      day = addDays(day, 1);
    }
    return intervals;
  };
}

export function fitWork(
  readCalendar: ReturnType<typeof createCalendarReader>,
  earliest: number,
  effortMilliseconds: number,
  reservations: TimeInterval[],
  horizon: number,
): TimeInterval[] | null {
  let cursor = earliest;
  for (const reservation of [
    ...reservations,
    { start: horizon, end: horizon },
  ]) {
    if (reservation.end <= cursor) continue;
    if (reservation.start > cursor) {
      const segments: TimeInterval[] = [];
      let remaining = effortMilliseconds;
      // Read a week at a time, never materializing ten years for a small task.
      for (
        let chunkStart = cursor;
        chunkStart < reservation.start && remaining > 0;
      ) {
        const chunkEnd = Math.min(
          chunkStart + 7 * 86_400_000,
          reservation.start,
        );
        for (const interval of readCalendar(chunkStart, chunkEnd)) {
          const duration = Math.min(remaining, interval.end - interval.start);
          segments.push({
            start: interval.start,
            end: interval.start + duration,
          });
          remaining -= duration;
          if (remaining <= 0) return mergeIntervals(segments);
        }
        chunkStart = chunkEnd;
      }
    }
    cursor = Math.max(cursor, reservation.end);
    if (cursor >= horizon) break;
  }
  return null;
}
