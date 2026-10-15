import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { describe, expect, it } from "vite-plus/test";
import {
  buildGanttTimeline,
  GANTT_WINDOW_DAYS,
  getBarGridColumns,
  parseTaskDate,
  toIsoDay,
} from "./timeline";

const span = (start: string, end = start) => ({
  scheduleStart: parseISO(start),
  scheduleEnd: parseISO(end),
});

describe("bounded Gantt timeline", () => {
  it("bounds allocation even for one task spanning years 0001 through 9999", () => {
    const timeline = buildGanttTimeline(
      [span("0001-01-01", "9999-12-31")],
      1,
      2.75,
      null,
      parseISO("2026-09-19"),
    );
    expect(timeline?.days).toHaveLength(GANTT_WINDOW_DAYS);
    expect(timeline?.rangeStart.getFullYear()).toBe(2026);
    expect(timeline?.timelineMinWidthRem).toBe(GANTT_WINDOW_DAYS * 2.75);
  });
  it("bounds separate distant tasks and supports jumping directly to either endpoint", () => {
    const tasks = [span("0001-01-01"), span("9999-12-31")];
    for (const date of ["0001-01-01", "9999-12-31"]) {
      const timeline = buildGanttTimeline(tasks, 1, 3, parseISO(date));
      expect(timeline?.days.length).toBeLessThanOrEqual(GANTT_WINDOW_DAYS);
      expect(
        timeline?.days.every((day) => Number.isFinite(day.getTime())),
      ).toBe(true);
      expect(parseISO(date).getTime()).toBeGreaterThanOrEqual(
        timeline?.rangeStart.getTime() ?? 0,
      );
      expect(parseISO(date).getTime()).toBeLessThanOrEqual(
        timeline?.rangeEnd.getTime() ?? 0,
      );
    }
  });
  it("retains week padding for a small normal schedule", () => {
    const timeline = buildGanttTimeline(
      [span("2026-09-14", "2026-09-18")],
      1,
      3,
    );
    expect(timeline?.rangeStart).toEqual(parseISO("2026-09-07"));
    expect(timeline?.rangeEnd).toEqual(parseISO("2026-10-18"));
    expect(timeline?.hasPrevious).toBe(false);
    expect(timeline?.hasNext).toBe(false);
  });
  it("pages a long project without gaps and stops at the final window", () => {
    const tasks = [span("2026-01-01", "2027-12-31")];
    let timeline = buildGanttTimeline(tasks, 0, 3, parseISO("2026-01-01"));
    for (let page = 0; page < 12 && timeline?.hasNext; page++) {
      const previous = timeline;
      timeline = buildGanttTimeline(
        tasks,
        0,
        3,
        addDays(previous.rangeStart, GANTT_WINDOW_DAYS),
      );
      expect(
        differenceInCalendarDays(
          timeline?.rangeStart ?? new Date(),
          previous.rangeEnd,
        ),
      ).toBeLessThanOrEqual(1);
      expect(timeline?.days.length).toBeLessThanOrEqual(GANTT_WINDOW_DAYS);
    }
    expect(timeline?.hasNext).toBe(false);
    expect(timeline?.rangeStart).toEqual(timeline?.maximumStart);
  });
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
