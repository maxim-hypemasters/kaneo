import { describe, expect, it } from "vite-plus/test";
import { rangeYears } from "./range-years";

describe("rangeYears", () => {
  it("lists the one year of a range inside it", () => {
    expect(
      rangeYears({ startDate: "2026-11-16", endDate: "2026-11-20" }),
    ).toEqual([2026]);
  });

  it("lists both years of a cross-year range", () => {
    expect(
      rangeYears({ startDate: "2026-12-28", endDate: "2027-01-08" }),
    ).toEqual([2026, 2027]);
  });

  it("unites several ranges in ascending order without repeats", () => {
    expect(
      rangeYears(
        { startDate: "2027-12-30", endDate: "2028-01-04" },
        { startDate: "2026-12-28", endDate: "2027-01-08" },
      ),
    ).toEqual([2026, 2027, 2028]);
  });

  it("lists nothing without ranges", () => {
    expect(rangeYears()).toEqual([]);
  });
});
