import { describe, expect, it } from "vite-plus/test";
import {
  weekdayHolidaysBetween,
  weekdayHolidaysInYear,
} from "./weekday-holidays-in-year";

// 2027-01-01 is a Friday, 2027-01-02 a Saturday, 2027-12-26 a Sunday.
const holidays = new Set([
  "2026-12-25",
  "2027-01-01",
  "2027-01-02",
  "2027-01-06",
  "2027-12-26",
]);

describe("weekdayHolidaysInYear", () => {
  it("counts weekday holidays of the year only", () => {
    expect(weekdayHolidaysInYear(holidays, 2027)).toBe(2);
    expect(weekdayHolidaysInYear(holidays, 2026)).toBe(1);
    expect(weekdayHolidaysInYear(holidays, 2028)).toBe(0);
  });

  it("counts nothing without holidays", () => {
    expect(weekdayHolidaysInYear(new Set(), 2027)).toBe(0);
  });
});

describe("weekdayHolidaysBetween", () => {
  it("counts weekday holidays in an inclusive range", () => {
    expect(weekdayHolidaysBetween(holidays, "2027-01-01", "2027-01-06")).toBe(
      2,
    );
    expect(weekdayHolidaysBetween(holidays, "2027-01-02", "2027-01-05")).toBe(
      0,
    );
  });
});
