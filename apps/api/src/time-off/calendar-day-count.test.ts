import { describe, expect, it } from "vite-plus/test";
import { calendarDayCount } from "./calendar-day-count";

describe("calendarDayCount", () => {
  it("counts both ends of the range", () => {
    expect(calendarDayCount("2026-11-16", "2026-11-16")).toBe(1);
    expect(calendarDayCount("2026-11-16", "2026-11-22")).toBe(7);
  });

  it("counts across a leap day and a year boundary", () => {
    expect(calendarDayCount("2028-02-28", "2028-03-01")).toBe(3);
    expect(calendarDayCount("2026-12-31", "2027-01-01")).toBe(2);
    expect(calendarDayCount("2028-01-01", "2028-12-31")).toBe(366);
  });

  it("returns 0 when the start is after the end", () => {
    expect(calendarDayCount("2026-11-17", "2026-11-16")).toBe(0);
  });
});
