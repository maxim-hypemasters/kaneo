import { describe, expect, it } from "vite-plus/test";
import { fitTaskDates } from "./fit-task-dates";

const at = (iso: string) => new Date(iso);
const hours = (count: number) => count * 60;
// Monday 2026-11-16, 09:00 UTC.
const monday = at("2026-11-16T09:00:00Z");

describe("fitTaskDates", () => {
  it("lays effort over working hours and skips the weekend", () => {
    // Friday 15:00: two hours that day, eight on Monday, six on Tuesday.
    expect(
      fitTaskDates({
        minutes: hours(16),
        now: at("2026-11-13T15:00:00Z"),
        timeZone: "UTC",
      }),
    ).toEqual({
      startDate: at("2026-11-13T15:00:00Z"),
      dueDate: at("2026-11-17T15:00:00Z"),
    });
  });

  it("starts work planned on a weekend on Monday morning", () => {
    expect(
      fitTaskDates({
        minutes: hours(4),
        now: at("2026-11-14T12:00:00Z"),
        timeZone: "UTC",
      }),
    ).toEqual({
      startDate: at("2026-11-16T09:00:00Z"),
      dueDate: at("2026-11-16T13:00:00Z"),
    });
  });

  it("follows working hours in the planning timezone", () => {
    // 08:00 in Berlin (UTC+1): work starts at 09:00 local.
    expect(
      fitTaskDates({
        minutes: hours(8),
        now: at("2026-11-16T07:00:00Z"),
        timeZone: "Europe/Berlin",
      }),
    ).toEqual({
      startDate: at("2026-11-16T08:00:00Z"),
      dueDate: at("2026-11-16T16:00:00Z"),
    });
  });

  it("skips blocked days whole", () => {
    // Monday and Tuesday away, given out of order and repeated.
    expect(
      fitTaskDates({
        minutes: hours(10),
        now: monday,
        timeZone: "UTC",
        blockedDays: ["2026-11-17", "2026-11-16", "2026-11-17"],
      }),
    ).toEqual({
      startDate: at("2026-11-18T09:00:00Z"),
      dueDate: at("2026-11-19T11:00:00Z"),
    });
  });

  it("splits effort across the free time around reservations", () => {
    // 11:00–12:00 on Monday is taken: 2 hours before it, 5 after, 1 on Tuesday.
    expect(
      fitTaskDates({
        minutes: hours(8),
        now: monday,
        timeZone: "UTC",
        reservations: [
          {
            start: at("2026-11-16T11:00:00Z"),
            end: at("2026-11-16T12:00:00Z"),
          },
        ],
      }),
    ).toEqual({
      startDate: monday,
      dueDate: at("2026-11-17T10:00:00Z"),
    });
  });

  it("starts after work that holds the beginning of the window", () => {
    // Overlapping, unsorted spans hold Monday and Tuesday morning; a span
    // that already ended changes nothing.
    expect(
      fitTaskDates({
        minutes: hours(6),
        now: monday,
        timeZone: "UTC",
        reservations: [
          {
            start: at("2026-11-16T15:00:00Z"),
            end: at("2026-11-17T12:00:00Z"),
          },
          {
            start: at("2026-11-16T08:00:00Z"),
            end: at("2026-11-16T16:00:00Z"),
          },
          {
            start: at("2026-11-10T09:00:00Z"),
            end: at("2026-11-12T17:00:00Z"),
          },
        ],
      }),
    ).toEqual({
      startDate: at("2026-11-17T12:00:00Z"),
      dueDate: at("2026-11-18T10:00:00Z"),
    });
  });

  it("combines blocked days and reservations", () => {
    // Monday is away and Tuesday is taken by other work.
    expect(
      fitTaskDates({
        minutes: hours(8),
        now: monday,
        timeZone: "UTC",
        blockedDays: ["2026-11-16"],
        reservations: [
          {
            start: at("2026-11-17T00:00:00Z"),
            end: at("2026-11-18T00:00:00Z"),
          },
        ],
      }),
    ).toEqual({
      startDate: at("2026-11-18T09:00:00Z"),
      dueDate: at("2026-11-18T17:00:00Z"),
    });
  });

  it("returns null when the effort doesn't fit within a year", () => {
    expect(
      fitTaskDates({ minutes: hours(8 * 270), now: monday, timeZone: "UTC" }),
    ).toBeNull();
    expect(
      fitTaskDates({
        minutes: hours(1),
        now: monday,
        timeZone: "UTC",
        reservations: [
          {
            start: at("2026-11-01T00:00:00Z"),
            end: at("2028-01-01T00:00:00Z"),
          },
        ],
      }),
    ).toBeNull();
  });

  it("returns null for no effort", () => {
    expect(fitTaskDates({ minutes: 0, now: monday, timeZone: "UTC" })).toBe(
      null,
    );
  });
});
