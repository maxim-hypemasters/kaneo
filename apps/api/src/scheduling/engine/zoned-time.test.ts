import { describe, expect, it } from "vite-plus/test";
import { createCalendarReader, fitWork } from "./calendar";
import { localInterval, startOfLocalDay } from "./zoned-time";

describe("working-calendar timezone boundaries", () => {
  it("omits nonexistent spring-forward time instead of shifting work outside working hours", () => {
    const intervals = localInterval("2026-03-08", 60, 240, "America/New_York");
    expect(intervals).toEqual([
      {
        start: Date.parse("2026-03-08T06:00:00Z"),
        end: Date.parse("2026-03-08T07:00:00Z"),
      },
      {
        start: Date.parse("2026-03-08T07:00:00Z"),
        end: Date.parse("2026-03-08T08:00:00Z"),
      },
    ]);
    expect(localInterval("2026-03-08", 120, 180, "America/New_York")).toEqual(
      [],
    );
  });

  it("includes both repeated fall-back intervals without filling excluded wall-clock minutes", () => {
    expect(localInterval("2026-11-01", 90, 105, "America/New_York")).toEqual([
      {
        start: Date.parse("2026-11-01T05:30:00Z"),
        end: Date.parse("2026-11-01T05:45:00Z"),
      },
      {
        start: Date.parse("2026-11-01T06:30:00Z"),
        end: Date.parse("2026-11-01T06:45:00Z"),
      },
    ]);
  });

  it("handles half-hour DST transitions", () => {
    const intervals = localInterval(
      "2026-10-04",
      120,
      180,
      "Australia/Lord_Howe",
    );
    expect(
      intervals.reduce(
        (sum, interval) => sum + interval.end - interval.start,
        0,
      ),
    ).toBe(30 * 60_000);
  });

  it("finds local midnight on both sides of DST and in non-hour-offset zones", () => {
    expect(
      new Date(startOfLocalDay("2026-03-08", "America/New_York")).toISOString(),
    ).toBe("2026-03-08T05:00:00.000Z");
    expect(
      new Date(startOfLocalDay("2026-03-09", "America/New_York")).toISOString(),
    ).toBe("2026-03-09T04:00:00.000Z");
    expect(
      new Date(startOfLocalDay("2026-10-26", "Asia/Kathmandu")).toISOString(),
    ).toBe("2026-10-25T18:15:00.000Z");
  });

  it("changes UTC working hours across DST while preserving local 09:00", () => {
    const reader = createCalendarReader({
      assigneeId: "member",
      timeZone: "America/New_York",
      weeklyIntervals: [1, 2, 3, 4, 5].map((weekday) => ({
        weekday,
        startMinute: 540,
        endMinute: 1020,
      })),
      timeOff: [],
    });
    const segments = fitWork(
      reader,
      Date.parse("2026-10-30T20:00:00Z"),
      3 * 3_600_000,
      [],
      Date.parse("2026-11-10T00:00:00Z"),
    );
    expect(segments).toEqual([
      {
        start: Date.parse("2026-10-30T20:00:00Z"),
        end: Date.parse("2026-10-30T21:00:00Z"),
      },
      {
        start: Date.parse("2026-11-02T14:00:00Z"),
        end: Date.parse("2026-11-02T16:00:00Z"),
      },
    ]);
  });

  it("merges overlapping weekly intervals and subtracts overlapping absences once", () => {
    const reader = createCalendarReader({
      assigneeId: "member",
      timeZone: "UTC",
      weeklyIntervals: [
        { weekday: 1, startMinute: 540, endMinute: 780 },
        { weekday: 1, startMinute: 720, endMinute: 1020 },
      ],
      timeOff: [
        { start: "2026-10-26T10:00:00Z", end: "2026-10-26T12:00:00Z" },
        { start: "2026-10-26T11:00:00Z", end: "2026-10-26T13:00:00Z" },
      ],
    });
    expect(
      reader(
        Date.parse("2026-10-26T00:00:00Z"),
        Date.parse("2026-10-27T00:00:00Z"),
      ),
    ).toEqual([
      {
        start: Date.parse("2026-10-26T09:00:00Z"),
        end: Date.parse("2026-10-26T10:00:00Z"),
      },
      {
        start: Date.parse("2026-10-26T13:00:00Z"),
        end: Date.parse("2026-10-26T17:00:00Z"),
      },
    ]);
  });
});
