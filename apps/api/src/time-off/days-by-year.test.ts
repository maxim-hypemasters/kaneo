import { describe, expect, it } from "vite-plus/test";
import { NO_HOLIDAYS } from "./count-workdays";
import { daysByYear } from "./days-by-year";

describe("daysByYear", () => {
  it("splits a cross-year range into 4 + 6 days", () => {
    expect(
      daysByYear(
        { startDate: "2026-12-28", endDate: "2027-01-08" },
        NO_HOLIDAYS,
      ),
    ).toEqual([
      { year: 2026, days: 4 },
      { year: 2027, days: 6 },
    ]);
  });

  it("leaves out a year touched only on a weekend", () => {
    expect(
      daysByYear(
        { startDate: "2022-12-31", endDate: "2023-01-03" },
        NO_HOLIDAYS,
      ),
    ).toEqual([{ year: 2023, days: 2 }]);
  });

  it("returns nothing for a weekend-only range", () => {
    expect(
      daysByYear(
        { startDate: "2026-11-14", endDate: "2026-11-15" },
        NO_HOLIDAYS,
      ),
    ).toEqual([]);
  });

  it("leaves out holidays, and a year touched only on a holiday", () => {
    // Thursday 2026-12-31 to Tuesday 2027-01-05, with both Jan 1 and Dec 31
    // as holidays.
    expect(
      daysByYear(
        { startDate: "2026-12-31", endDate: "2027-01-05" },
        new Set(["2026-12-31", "2027-01-01"]),
      ),
    ).toEqual([{ year: 2027, days: 2 }]);
  });
});
