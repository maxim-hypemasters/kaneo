import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  scheduleDayPosition,
  scheduleSegmentGeometry,
} from "./schedule-geometry";

const originalTimeZone = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTimeZone;
});

describe("intraday schedule geometry", () => {
  it("places exact times within equal-width local calendar days", () => {
    const start = new Date(2026, 8, 1);
    expect(scheduleDayPosition(new Date(2026, 8, 2, 6), start)).toBe(1.25);
    const segment = scheduleSegmentGeometry(
      new Date(2026, 8, 2, 9),
      new Date(2026, 8, 2, 17),
      start,
      30,
    );
    expect(segment?.left).toBe(1.375);
    expect(segment?.width).toBeCloseTo(1 / 3);
  });
  it("clips either edge and excludes segments outside the range", () => {
    const start = new Date(2026, 8, 1);
    expect(
      scheduleSegmentGeometry(
        new Date(2026, 7, 31, 12),
        new Date(2026, 8, 1, 12),
        start,
        2,
      ),
    ).toEqual({ left: 0, width: 0.5, clippedStart: true, clippedEnd: false });
    expect(
      scheduleSegmentGeometry(
        new Date(2026, 8, 2, 12),
        new Date(2026, 8, 4),
        start,
        2,
      ),
    ).toEqual({ left: 1.5, width: 0.5, clippedStart: false, clippedEnd: true });
    expect(
      scheduleSegmentGeometry(
        new Date(2026, 8, 3),
        new Date(2026, 8, 4),
        start,
        2,
      ),
    ).toBeNull();
  });
  it("maps 23-hour and 25-hour days monotonically without moving the next date", () => {
    process.env.TZ = "America/New_York";
    const spring = new Date(2026, 2, 8);
    expect(scheduleDayPosition(new Date(2026, 2, 9), spring)).toBe(1);
    expect(
      scheduleDayPosition(new Date("2026-03-08T07:00:00Z"), spring),
    ).toBeCloseTo(2 / 23);
    const fall = new Date(2026, 10, 1);
    expect(
      scheduleDayPosition(new Date("2026-11-01T05:30:00Z"), fall),
    ).toBeLessThan(scheduleDayPosition(new Date("2026-11-01T06:30:00Z"), fall));
    expect(scheduleDayPosition(new Date(2026, 10, 2), fall)).toBe(1);
  });
});
