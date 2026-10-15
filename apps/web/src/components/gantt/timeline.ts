import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfWeek,
  parseISO,
  startOfDay,
  startOfWeek,
  subDays,
} from "date-fns";

// The timeline grows and shrinks in chunks of this many days as it scrolls.
export const GANTT_CHUNK_DAYS = 91;
// Rendered span bounds: always wide enough to scroll, never so wide that a
// legacy task spanning years 0001-9999 allocates thousands of columns.
export const GANTT_MIN_DAYS = 2 * GANTT_CHUNK_DAYS;
export const GANTT_MAX_DAYS = 4 * GANTT_CHUNK_DAYS;
export const GANTT_FIRST_DAY = parseISO("0001-01-01");
export const GANTT_LAST_DAY = parseISO("9999-12-31");

export function parseTaskDate(value: string | null) {
  if (!value) return null;
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ||
    parsed < GANTT_FIRST_DAY ||
    startOfDay(parsed) > GANTT_LAST_DAY
    ? null
    : parsed;
}

function clampDate(date: Date, minimum: Date, maximum: Date) {
  return new Date(
    Math.max(minimum.getTime(), Math.min(date.getTime(), maximum.getTime())),
  );
}

// Inclusive span of whole days the timeline renders.
export type GanttRange = { start: Date; end: Date };

type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// `days` days starting at `start`, shifted (not shortened) to stay inside
// the supported dates.
function rangeOfDays(start: Date, days: number): GanttRange {
  const first = startOfDay(
    clampDate(start, GANTT_FIRST_DAY, subDays(GANTT_LAST_DAY, days - 1)),
  );
  return { start: first, end: addDays(first, days - 1) };
}

// The project's scheduled work, padded by a week before the first task's
// week and four weeks after the last one's.
export function paddedSchedule(
  tasks: { scheduleStart: Date; scheduleEnd: Date }[],
  weekStartsOn: WeekStartsOn,
): GanttRange | null {
  if (tasks.length === 0) return null;
  let earliest = tasks[0].scheduleStart;
  let latest = tasks[0].scheduleEnd;
  for (const task of tasks) {
    if (task.scheduleStart < earliest) earliest = task.scheduleStart;
    if (task.scheduleEnd > latest) latest = task.scheduleEnd;
  }
  return {
    start: clampDate(
      subDays(startOfWeek(earliest, { weekStartsOn }), 7),
      GANTT_FIRST_DAY,
      GANTT_LAST_DAY,
    ),
    end: clampDate(
      startOfDay(addDays(endOfWeek(latest, { weekStartsOn }), 28)),
      GANTT_FIRST_DAY,
      GANTT_LAST_DAY,
    ),
  };
}

// The span a project opens on: all of its scheduled work plus padding when
// that fits, otherwise a stretch around today (or the first task) that grows
// as the timeline is scrolled.
export function initialGanttRange(
  tasks: { scheduleStart: Date; scheduleEnd: Date }[],
  weekStartsOn: WeekStartsOn,
  today: Date = new Date(),
): GanttRange | null {
  const schedule = paddedSchedule(tasks, weekStartsOn);
  if (!schedule) return null;
  const span = differenceInCalendarDays(schedule.end, schedule.start) + 1;
  if (span <= GANTT_MAX_DAYS) {
    return rangeOfDays(schedule.start, Math.max(span, GANTT_MIN_DAYS));
  }
  let earliest = tasks[0].scheduleStart;
  let latest = tasks[0].scheduleEnd;
  for (const task of tasks) {
    if (task.scheduleStart < earliest) earliest = task.scheduleStart;
    if (task.scheduleEnd > latest) latest = task.scheduleEnd;
  }
  const anchor = today >= earliest && today <= latest ? today : earliest;
  return rangeOfDays(
    subDays(startOfWeek(anchor, { weekStartsOn }), 7),
    GANTT_MIN_DAYS,
  );
}

// A fresh span for jumping to a date outside the rendered one, with room to
// scroll on both sides of it.
export function ganttRangeAround(date: Date, weekStartsOn: WeekStartsOn) {
  return rangeOfDays(
    subDays(startOfWeek(date, { weekStartsOn }), 8 * 7),
    GANTT_MIN_DAYS,
  );
}

// Grows the span by a chunk on one side, trimming the other side so it never
// exceeds `maxDays` (GANTT_MAX_DAYS unless the viewport needs more). Returns null at the edge of the supported dates.
// `added`/`trimmed` are day counts, so the caller can keep the scroll
// position on the same dates.
export function extendGanttRange(
  range: GanttRange,
  side: "start" | "end",
  maxDays: number = GANTT_MAX_DAYS,
) {
  if (side === "start") {
    const start = clampDate(
      subDays(range.start, GANTT_CHUNK_DAYS),
      GANTT_FIRST_DAY,
      range.start,
    );
    const added = differenceInCalendarDays(range.start, start);
    if (added === 0) return null;
    const end = clampDate(range.end, start, addDays(start, maxDays - 1));
    return {
      range: { start, end },
      added,
      trimmed: differenceInCalendarDays(range.end, end),
    };
  }
  const end = clampDate(
    addDays(range.end, GANTT_CHUNK_DAYS),
    range.end,
    GANTT_LAST_DAY,
  );
  const added = differenceInCalendarDays(end, range.end);
  if (added === 0) return null;
  const start = clampDate(range.start, subDays(end, maxDays - 1), end);
  return {
    range: { start, end },
    added,
    trimmed: differenceInCalendarDays(start, range.start),
  };
}

export function buildGanttTimeline(
  range: GanttRange,
  dayColumnWidthRem: number,
) {
  const days = eachDayOfInterval({ start: range.start, end: range.end });
  return {
    days,
    rangeStart: range.start,
    rangeEnd: range.end,
    hasPrevious: range.start > GANTT_FIRST_DAY,
    hasNext: startOfDay(range.end) < startOfDay(GANTT_LAST_DAY),
    gridTemplateColumns: `repeat(${days.length}, minmax(${dayColumnWidthRem}rem, ${dayColumnWidthRem}rem))`,
    timelineMinWidthRem: days.length * dayColumnWidthRem,
  };
}

export type GanttTimeline = NonNullable<ReturnType<typeof buildGanttTimeline>>;

export function toIsoDay(date: Date) {
  return startOfDay(date).toISOString();
}

// Maps a date span onto 1-based CSS grid lines of the visible window. Spans
// that run past either edge are clipped to it; `clippedStart`/`clippedEnd`
// say which side continues off-screen.
export function getBarGridColumns(
  start: Date,
  end: Date,
  rangeStart: Date,
  trackCount: number,
) {
  const startIndex = differenceInCalendarDays(start, rangeStart);
  const endIndex = differenceInCalendarDays(end, rangeStart);
  const barInView = endIndex >= 0 && startIndex < trackCount && trackCount > 0;
  if (!barInView) {
    return {
      barInView: false,
      lineStart: 1,
      lineEnd: 1,
      clippedStart: false,
      clippedEnd: false,
    };
  }
  const lineStart = Math.max(1, Math.min(startIndex + 1, trackCount));
  const lineEnd = Math.max(
    lineStart + 1,
    Math.min(endIndex + 2, trackCount + 1),
  );
  return {
    barInView: true,
    lineStart,
    lineEnd,
    clippedStart: startIndex < 0,
    clippedEnd: endIndex >= trackCount,
  };
}
