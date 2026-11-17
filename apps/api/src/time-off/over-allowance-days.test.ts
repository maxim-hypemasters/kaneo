import { describe, expect, it } from "vite-plus/test";
import { NO_HOLIDAYS } from "./count-workdays";
import { overAllowanceDays } from "./over-allowance-days";
import type { TimeOffBalance, TimeOffTypeBalance } from "./summarize-balance";

function figures(usedDays: number, allowanceDays: number): TimeOffTypeBalance {
  return {
    allowanceDays,
    allowanceSource: "default",
    usedDays,
    pendingDays: 0,
    remainingDays: allowanceDays - usedDays,
  };
}

function balance(
  year: number,
  vacationUsed: number,
  vacationAllowance = 25,
): TimeOffBalance {
  return {
    workspaceId: "ws",
    userId: "ana",
    year,
    types: {
      vacation: figures(vacationUsed, vacationAllowance),
      sick: figures(0, 10),
      public_holiday: figures(0, 10),
    },
  };
}

const crossYear = {
  startDate: "2026-12-28",
  endDate: "2027-01-08",
  type: "vacation" as const,
};

describe("overAllowanceDays", () => {
  it("reports 0 for each year that stays within the allowance", () => {
    expect(
      overAllowanceDays(
        crossYear,
        [balance(2026, 21), balance(2027, 0)],
        NO_HOLIDAYS,
      ),
    ).toEqual([
      { year: 2026, days: 0 },
      { year: 2027, days: 0 },
    ]);
  });

  it("reports how far each year would go over", () => {
    expect(
      overAllowanceDays(
        crossYear,
        [balance(2026, 23), balance(2027, 0, 4)],
        NO_HOLIDAYS,
      ),
    ).toEqual([
      { year: 2026, days: 2 },
      { year: 2027, days: 2 },
    ]);
  });

  it("compares against the request's own type", () => {
    expect(
      overAllowanceDays(
        { ...crossYear, type: "sick" },
        [balance(2026, 25), balance(2027, 25)],
        NO_HOLIDAYS,
      ),
    ).toEqual([
      { year: 2026, days: 0 },
      { year: 2027, days: 0 },
    ]);
  });

  it("leaves the member's holidays out of the days", () => {
    expect(
      overAllowanceDays(
        crossYear,
        [balance(2026, 23), balance(2027, 0, 4)],
        new Set(["2026-12-31", "2027-01-01", "2027-01-06"]),
      ),
    ).toEqual([
      { year: 2026, days: 1 },
      { year: 2027, days: 0 },
    ]);
  });

  it("leaves out years without a balance and weekend-only years", () => {
    expect(
      overAllowanceDays(
        { startDate: "2022-12-31", endDate: "2023-01-03", type: "vacation" },
        [balance(2022, 30)],
        NO_HOLIDAYS,
      ),
    ).toEqual([]);
  });
});
