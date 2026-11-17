import { describe, expect, it } from "vite-plus/test";
import { formatDayRange } from "./format-day-range";

describe("formatDayRange", () => {
  it("shows a single day once", () => {
    expect(formatDayRange("2026-11-16", "2026-11-16")).toBe("Nov 16, 2026");
  });

  it("shares the month and year inside one month", () => {
    expect(formatDayRange("2026-11-16", "2026-11-20")).toBe(
      "Nov 16 – 20, 2026",
    );
  });

  it("names both months across a month", () => {
    expect(formatDayRange("2026-11-30", "2026-12-02")).toBe(
      "Nov 30 – Dec 2, 2026",
    );
  });

  it("names both years across a year", () => {
    expect(formatDayRange("2026-12-28", "2027-01-04")).toBe(
      "Dec 28, 2026 – Jan 4, 2027",
    );
  });

  it("reads days as UTC calendar days", () => {
    expect(formatDayRange("2026-03-01", "2026-03-01")).toBe("Mar 1, 2026");
  });

  it("returns null for invalid or reversed ranges", () => {
    expect(formatDayRange("2026-11-20", "2026-11-16")).toBeNull();
    expect(formatDayRange("2026-02-30", "2026-03-02")).toBeNull();
    expect(formatDayRange("next week", "2026-11-20")).toBeNull();
    expect(formatDayRange("2026-11-16T00:00:00Z", "2026-11-20")).toBeNull();
  });
});
