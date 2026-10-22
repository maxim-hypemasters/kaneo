import { differenceInCalendarDays, parseISO } from "date-fns";
import { describe, expect, it } from "vite-plus/test";
import {
  ganttZoomAnchor,
  scrollLeftForZoomAnchor,
  zoomedDayWidth,
} from "./gantt-zoom";

describe("Gantt zoom math", () => {
  it("scales continuously, bounds each frame, and clamps the day width", () => {
    expect(zoomedDayWidth(2.75, -10)).toBeCloseTo(2.75 * Math.exp(0.02));
    expect(zoomedDayWidth(2.75, 10)).toBeCloseTo(2.75 * Math.exp(-0.02));
    expect(zoomedDayWidth(2.75, 1000)).toBe(zoomedDayWidth(2.75, 120));
    expect(zoomedDayWidth(2.75, -1000)).toBe(zoomedDayWidth(2.75, -120));
    expect(zoomedDayWidth(2, 120)).toBe(2);
    expect(zoomedDayWidth(8, -120)).toBe(8);
    expect(zoomedDayWidth(3, Number.NaN)).toBe(3);
  });

  it("retains fractional calendar days across a DST boundary and range shift", () => {
    const start = parseISO("2026-03-07");
    const anchor = ganttZoomAnchor(start, 80, 20, 40);
    expect(anchor.day).toEqual(parseISO("2026-03-09"));
    expect(anchor.fraction).toBe(0.5);
    const shiftedStart = parseISO("2026-03-01");
    expect(differenceInCalendarDays(anchor.day, shiftedStart)).toBe(8);
    expect(scrollLeftForZoomAnchor(anchor, shiftedStart, 20, 64)).toBe(524);
  });
});
