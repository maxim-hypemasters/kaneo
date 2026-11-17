import { describe, expect, it } from "vite-plus/test";
import { coalesceDays } from "./coalesce-days";

describe("coalesceDays", () => {
  it("merges consecutive days across month and year ends", () => {
    expect(
      coalesceDays([
        "2026-12-24",
        "2026-12-25",
        "2026-12-26",
        "2026-12-31",
        "2027-01-01",
        "2027-01-06",
      ]),
    ).toEqual([
      { startDate: "2026-12-24", endDate: "2026-12-26" },
      { startDate: "2026-12-31", endDate: "2027-01-01" },
      { startDate: "2027-01-06", endDate: "2027-01-06" },
    ]);
  });

  it("sorts and drops repeated days", () => {
    expect(
      coalesceDays(["2027-05-02", "2027-05-01", "2027-05-01", "2027-04-29"]),
    ).toEqual([
      { startDate: "2027-04-29", endDate: "2027-04-29" },
      { startDate: "2027-05-01", endDate: "2027-05-02" },
    ]);
  });

  it("returns nothing for no days", () => {
    expect(coalesceDays([])).toEqual([]);
  });
});
