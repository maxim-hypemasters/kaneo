import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { describe, expect, it } from "vite-plus/test";
import {
  buildGanttTimeline,
  extendGanttRange,
  GANTT_CHUNK_DAYS,
  GANTT_FIRST_DAY,
  GANTT_LAST_DAY,
  GANTT_MAX_DAYS,
  GANTT_MIN_DAYS,
  type GanttRange,
  ganttRangeAround,
  getBarGridColumns,
  initialGanttRange,
  parseTaskDate,
  toIsoDay,
} from "./timeline";

const span = (start: string, end = start) => ({
  scheduleStart: parseISO(start),
  scheduleEnd: parseISO(end),
});
const length = (range: GanttRange) =>
  differenceInCalendarDays(range.end, range.start) + 1;

describe("initialGanttRange", () => {
  it("opens on all of a normal schedule with week padding", () => {
    const range = initialGanttRange(
      [span("2026-03-02", "2026-03-04"), span("2026-07-20", "2026-07-24")],
      1,
      parseISO("2026-05-01"),
    );
    // A week before the first task's week, four weeks after the last's.
    expect(range?.start).toEqual(parseISO("2026-02-23"));
    expect(range?.end).toEqual(parseISO("2026-08-23"));
  });

  it("still renders enough days to scroll for a short schedule", () => {
    const range = initialGanttRange([span("2026-09-14", "2026-09-18")], 1);
    expect(range?.start).toEqual(parseISO("2026-09-07"));
    expect(range && length(range)).toBe(GANTT_MIN_DAYS);
  });

  it("opens around today when the schedule is longer than the cap", () => {
    const range = initialGanttRange(
      [span("2024-01-01", "2028-12-31")],
      0,
      parseISO("2026-09-19"),
    );
    // Sunday week start: Sep 13 week, one week earlier.
    expect(range?.start).toEqual(parseISO("2026-09-06"));
    expect(range && length(range)).toBe(GANTT_MIN_DAYS);
  });

  it("bounds allocation even for one task spanning years 0001 through 9999", () => {
    const range = initialGanttRange(
      [span("0001-01-01", "9999-12-31")],
      1,
      parseISO("2026-09-19"),
    );
    expect(range && length(range)).toBe(GANTT_MIN_DAYS);
    expect(range?.start.getFullYear()).toBe(2026);
  });

  it("stays inside the supported dates at both ends", () => {
    for (const date of ["0001-01-01", "9999-12-31"]) {
      const range = initialGanttRange([span(date)], 1);
      expect(range && length(range)).toBe(GANTT_MIN_DAYS);
      expect(range?.start.getTime()).toBeGreaterThanOrEqual(
        GANTT_FIRST_DAY.getTime(),
      );
      expect(range?.end.getTime()).toBeLessThanOrEqual(
        GANTT_LAST_DAY.getTime(),
      );
    }
  });

  it("has nothing to show without scheduled tasks", () => {
    expect(initialGanttRange([], 1)).toBeNull();
  });
});

describe("extendGanttRange", () => {
  const range = {
    start: parseISO("2026-01-05"),
    end: addDays(parseISO("2026-01-05"), GANTT_MIN_DAYS - 1),
  };

  it("grows the start by a chunk and reports the added days", () => {
    const grown = extendGanttRange(range, "start");
    expect(grown?.range.start).toEqual(addDays(range.start, -GANTT_CHUNK_DAYS));
    expect(grown?.range.end).toEqual(range.end);
    expect(grown?.added).toBe(GANTT_CHUNK_DAYS);
    expect(grown?.trimmed).toBe(0);
  });

  it("trims the far side once the span reaches the cap", () => {
    let current: GanttRange = range;
    let trimmedTotal = 0;
    for (let step = 0; step < 6; step++) {
      const grown = extendGanttRange(current, "end");
      if (!grown) throw new Error("unexpected edge");
      current = grown.range;
      trimmedTotal += grown.trimmed;
      expect(length(current)).toBeLessThanOrEqual(GANTT_MAX_DAYS);
      // Trimmed days always come off the start, keeping the span contiguous.
      expect(differenceInCalendarDays(current.start, range.start)).toBe(
        trimmedTotal,
      );
    }
    expect(length(current)).toBe(GANTT_MAX_DAYS);
  });

  it("honours a larger cap for wide viewports", () => {
    let current: GanttRange = range;
    for (let step = 0; step < 6; step++) {
      const grown = extendGanttRange(current, "end", 500);
      if (!grown) throw new Error("unexpected edge");
      current = grown.range;
    }
    expect(length(current)).toBe(500);
  });

  it("stops at the first and last supported dates", () => {
    const first = { start: GANTT_FIRST_DAY, end: addDays(GANTT_FIRST_DAY, 99) };
    expect(extendGanttRange(first, "start")).toBeNull();

    const nearLast = {
      start: addDays(GANTT_LAST_DAY, -150),
      end: addDays(GANTT_LAST_DAY, -10),
    };
    const grown = extendGanttRange(nearLast, "end");
    expect(grown?.range.end).toEqual(GANTT_LAST_DAY);
    expect(grown?.added).toBe(10);
    expect(grown && extendGanttRange(grown.range, "end")).toBeNull();
  });
});

describe("ganttRangeAround", () => {
  it("re-centres on a far date with room to scroll both ways", () => {
    const range = ganttRangeAround(parseISO("2031-06-18"), 1);
    expect(length(range)).toBe(GANTT_MIN_DAYS);
    const offset = differenceInCalendarDays(
      parseISO("2031-06-18"),
      range.start,
    );
    expect(offset).toBeGreaterThanOrEqual(56);
    expect(offset).toBeLessThan(GANTT_MIN_DAYS - 56);
  });
});

describe("buildGanttTimeline", () => {
  it("renders one column per day of the range", () => {
    const timeline = buildGanttTimeline(
      { start: parseISO("2026-09-07"), end: parseISO("2026-10-18") },
      3,
    );
    expect(timeline.days).toHaveLength(42);
    expect(timeline.timelineMinWidthRem).toBe(126);
    expect(timeline.gridTemplateColumns).toBe("repeat(42, minmax(3rem, 3rem))");
    expect(timeline.hasPrevious).toBe(true);
    expect(timeline.hasNext).toBe(true);
  });

  it("knows when it reaches the supported dates", () => {
    expect(
      buildGanttTimeline(
        { start: GANTT_FIRST_DAY, end: addDays(GANTT_FIRST_DAY, 9) },
        3,
      ).hasPrevious,
    ).toBe(false);
    expect(
      buildGanttTimeline(
        { start: addDays(GANTT_LAST_DAY, -9), end: GANTT_LAST_DAY },
        3,
      ).hasNext,
    ).toBe(false);
  });
});

describe("parseTaskDate", () => {
  it.each([null, "invalid", "+275760-09-13", "-000001-01-01"])(
    "ignores unsupported legacy dates safely (%s)",
    (value) => {
      expect(parseTaskDate(value)).toBeNull();
    },
  );
});

describe("getBarGridColumns", () => {
  const rangeStart = parseISO("2026-09-07");
  const columns = (start: string, end: string, trackCount = 42) =>
    getBarGridColumns(parseISO(start), parseISO(end), rangeStart, trackCount);

  it("maps a span inside the window onto 1-based grid lines", () => {
    expect(columns("2026-09-10", "2026-09-12")).toEqual({
      barInView: true,
      lineStart: 4,
      lineEnd: 7,
      clippedStart: false,
      clippedEnd: false,
    });
  });

  it("clips spans that run past either edge and says which side", () => {
    expect(columns("2026-09-01", "2026-09-08")).toMatchObject({
      lineStart: 1,
      lineEnd: 3,
      clippedStart: true,
      clippedEnd: false,
    });
    expect(columns("2026-10-15", "2026-10-30")).toMatchObject({
      lineStart: 39,
      lineEnd: 43,
      clippedStart: false,
      clippedEnd: true,
    });
  });

  it("reports spans entirely outside the window, or an empty window, as not in view", () => {
    expect(columns("2026-08-01", "2026-09-06").barInView).toBe(false);
    expect(columns("2026-10-19", "2026-10-20").barInView).toBe(false);
    expect(columns("2026-09-10", "2026-09-12", 0).barInView).toBe(false);
  });
});

describe("toIsoDay", () => {
  it("serializes the start of the local day", () => {
    const value = parseISO("2026-09-10T17:45");
    expect(toIsoDay(value)).toBe(
      new Date(2026, 8, 10, 0, 0, 0, 0).toISOString(),
    );
  });
});
