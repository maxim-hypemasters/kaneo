import { describe, expect, it } from "vite-plus/test";
import { calendarDayCount } from "./calendar-day-count";
import { countWorkdays, NO_HOLIDAYS } from "./count-workdays";

describe("countWorkdays", () => {
  it("counts Monday to Friday inclusively", () => {
    expect(countWorkdays("2026-11-16", "2026-11-20", NO_HOLIDAYS)).toBe(5);
    expect(countWorkdays("2026-11-16", "2026-11-16", NO_HOLIDAYS)).toBe(1);
    expect(countWorkdays("2026-11-13", "2026-11-16", NO_HOLIDAYS)).toBe(2);
  });

  it("counts nothing for a weekend", () => {
    expect(countWorkdays("2026-11-14", "2026-11-15", NO_HOLIDAYS)).toBe(0);
  });

  it("returns 0 when the start is after the end", () => {
    expect(countWorkdays("2026-11-20", "2026-11-16", NO_HOLIDAYS)).toBe(0);
    expect(calendarDayCount("2026-11-20", "2026-11-16")).toBe(0);
  });

  it("counts whole years and leap days", () => {
    expect(countWorkdays("2026-01-01", "2026-12-31", NO_HOLIDAYS)).toBe(261);
    expect(countWorkdays("2028-02-28", "2028-03-01", NO_HOLIDAYS)).toBe(3);
    expect(calendarDayCount("2028-01-01", "2028-12-31")).toBe(366);
  });

  it("does not shift a day across a daylight saving change", () => {
    expect(calendarDayCount("2026-03-07", "2026-03-09")).toBe(3);
    expect(countWorkdays("2026-10-23", "2026-10-26", NO_HOLIDAYS)).toBe(2);
  });

  it("leaves out holidays on weekdays inside the range only", () => {
    const holidays = new Set([
      // Wednesday, inside.
      "2026-11-18",
      // Saturday, inside: a weekend already doesn't count.
      "2026-11-21",
      // Monday, outside.
      "2026-11-30",
    ]);
    expect(countWorkdays("2026-11-16", "2026-11-22", holidays)).toBe(4);
    expect(countWorkdays("2026-11-18", "2026-11-18", holidays)).toBe(0);
  });
});
