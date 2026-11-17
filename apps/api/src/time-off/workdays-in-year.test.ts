import { describe, expect, it } from "vite-plus/test";
import { NO_HOLIDAYS } from "./count-workdays";
import { workdaysInYear } from "./workdays-in-year";

describe("workdaysInYear", () => {
  it("splits a cross-year range at the year boundary", () => {
    const range = { startDate: "2026-12-28", endDate: "2027-01-08" };
    expect(workdaysInYear(range, 2026, NO_HOLIDAYS)).toBe(4);
    expect(workdaysInYear(range, 2027, NO_HOLIDAYS)).toBe(6);
  });

  it("counts nothing for a range outside the year", () => {
    const range = { startDate: "2026-11-16", endDate: "2026-11-20" };
    expect(workdaysInYear(range, 2025, NO_HOLIDAYS)).toBe(0);
    expect(workdaysInYear(range, 2027, NO_HOLIDAYS)).toBe(0);
  });

  it("counts a range inside the year in full", () => {
    expect(
      workdaysInYear(
        { startDate: "2028-02-28", endDate: "2028-03-01" },
        2028,
        NO_HOLIDAYS,
      ),
    ).toBe(3);
  });

  it("leaves out the year's weekday holidays only", () => {
    const range = { startDate: "2026-12-28", endDate: "2027-01-08" };
    const holidays = new Set(["2026-12-31", "2027-01-01", "2027-01-06"]);
    expect(workdaysInYear(range, 2026, holidays)).toBe(3);
    expect(workdaysInYear(range, 2027, holidays)).toBe(4);
  });
});
