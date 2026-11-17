import { describe, expect, it } from "vite-plus/test";
import { dayRangeLabel } from "./day-range-label.js";

describe("dayRangeLabel", () => {
  it("formats single days and ranges as UTC calendar days", () => {
    expect(dayRangeLabel("2026-11-16", "2026-11-16")).toBe("Nov 16, 2026");
    expect(dayRangeLabel("2026-11-16", "2026-11-20")).toBe("Nov 16 – 20, 2026");
    expect(dayRangeLabel("2026-12-28", "2027-01-04")).toBe(
      "Dec 28, 2026 – Jan 4, 2027",
    );
  });

  it("returns null for missing, invalid or reversed days", () => {
    expect(dayRangeLabel(null, "2026-11-20")).toBeNull();
    expect(dayRangeLabel("2026-02-30", "2026-03-02")).toBeNull();
    expect(dayRangeLabel("2026-11-20", "2026-11-16")).toBeNull();
  });
});
