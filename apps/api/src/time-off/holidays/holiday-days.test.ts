import { describe, expect, it } from "vite-plus/test";
import { toHolidayDays, yearsWindow } from "./holiday-days";

describe("toHolidayDays", () => {
  it("keeps each member's dates and drops the names", () => {
    const days = toHolidayDays(
      new Map([
        [
          "u1",
          [
            { date: "2027-01-01", name: "New Year" },
            { date: "2027-01-06", name: "Epiphany" },
          ],
        ],
        ["u2", []],
      ]),
    );
    expect([...days.keys()]).toEqual(["u1", "u2"]);
    expect([...(days.get("u1") ?? [])]).toEqual(["2027-01-01", "2027-01-06"]);
    expect(days.get("u2")?.size).toBe(0);
  });
});

describe("yearsWindow", () => {
  it("spans whole years from the first to the last", () => {
    expect(yearsWindow([2027])).toEqual({
      from: "2027-01-01",
      to: "2027-12-31",
    });
    expect(yearsWindow([2028, 2026, 2027])).toEqual({
      from: "2026-01-01",
      to: "2028-12-31",
    });
  });
});
