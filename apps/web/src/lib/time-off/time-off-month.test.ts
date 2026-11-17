import { describe, expect, it } from "vite-plus/test";
import {
  daysInMonth,
  isMonthParam,
  monthDays,
  monthRange,
  monthYear,
  shiftMonth,
  toMonthParam,
} from "./time-off-month";

describe("time-off month", () => {
  it("accepts only YYYY-MM", () => {
    expect(isMonthParam("2026-11")).toBe(true);
    expect(isMonthParam("2026-13")).toBe(false);
    expect(isMonthParam("2026-1")).toBe(false);
    expect(isMonthParam("2026-11-01")).toBe(false);
    expect(isMonthParam(202611)).toBe(false);
  });

  it("finds a day's month and year", () => {
    expect(toMonthParam("2026-11-14")).toBe("2026-11");
    expect(monthYear("2026-11")).toBe(2026);
  });

  it("shifts across years in both directions", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-11", 12)).toBe("2027-11");
    expect(shiftMonth("2026-11", -23)).toBe("2024-12");
  });

  it("covers every day of the month, leap years included", () => {
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-02")).toBe(28);
    expect(monthRange("2026-11")).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
    });
    const days = monthDays("2026-02");
    expect(days).toHaveLength(28);
    expect(days[0]).toBe("2026-02-01");
    expect(days.at(-1)).toBe("2026-02-28");
  });
});
