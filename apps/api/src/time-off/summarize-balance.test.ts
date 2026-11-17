import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_ALLOWANCE_DAYS } from "./constants";
import { NO_HOLIDAYS } from "./count-workdays";
import {
  type BalanceAllowances,
  type BalanceRange,
  summarizeBalance,
} from "./summarize-balance";

const allowances: BalanceAllowances = {
  workspaceId: "ws",
  userId: "ana",
  year: 2026,
  defaults: DEFAULT_ALLOWANCE_DAYS,
  overrides: {},
};

const empty = (allowanceDays: number) => ({
  allowanceDays,
  allowanceSource: "default",
  usedDays: 0,
  pendingDays: 0,
  remainingDays: allowanceDays,
});

// Monday 2026-11-16 to Friday 2026-11-20.
const week = { startDate: "2026-11-16", endDate: "2026-11-20" };

describe("summarizeBalance", () => {
  it("uses 25/10/10 days without a policy or override", () => {
    expect(summarizeBalance(allowances, [], NO_HOLIDAYS)).toEqual({
      workspaceId: "ws",
      userId: "ana",
      year: 2026,
      types: {
        vacation: empty(25),
        sick: empty(10),
        public_holiday: empty(10),
      },
    });
  });

  it("applies a workspace default and an override to their own type only", () => {
    const { types } = summarizeBalance(
      {
        ...allowances,
        defaults: { ...DEFAULT_ALLOWANCE_DAYS, vacation: 20 },
        overrides: { sick: 0 },
      },
      [],
      NO_HOLIDAYS,
    );
    expect(types.vacation).toMatchObject({
      allowanceDays: 20,
      allowanceSource: "default",
    });
    expect(types.sick).toMatchObject({
      allowanceDays: 0,
      allowanceSource: "override",
      remainingDays: 0,
    });
    expect(types.public_holiday).toMatchObject({
      allowanceDays: 10,
      allowanceSource: "default",
    });
  });

  it("counts each range toward its own type only", () => {
    const ranges: BalanceRange[] = [
      { ...week, type: "vacation", status: "approved" },
      {
        startDate: "2026-11-23",
        endDate: "2026-11-24",
        type: "sick",
        status: "approved",
      },
      {
        startDate: "2026-11-25",
        endDate: "2026-11-25",
        type: "public_holiday",
        status: "pending",
      },
    ];
    const { types } = summarizeBalance(allowances, ranges, NO_HOLIDAYS);
    expect(types.vacation).toMatchObject({
      usedDays: 5,
      pendingDays: 0,
      remainingDays: 20,
    });
    expect(types.sick).toMatchObject({
      usedDays: 2,
      pendingDays: 0,
      remainingDays: 8,
    });
    expect(types.public_holiday).toMatchObject({
      usedDays: 0,
      pendingDays: 1,
      remainingDays: 10,
    });
  });

  it("counts approved days as used, pending separately, and nothing else", () => {
    const { types } = summarizeBalance(
      allowances,
      [
        { ...week, type: "vacation", status: "approved" },
        {
          startDate: "2026-11-23",
          endDate: "2026-11-24",
          type: "vacation",
          status: "pending",
        },
        {
          startDate: "2026-11-25",
          endDate: "2026-11-25",
          type: "vacation",
          status: "declined",
        },
        {
          startDate: "2026-11-26",
          endDate: "2026-11-26",
          type: "vacation",
          status: "cancelled",
        },
      ],
      NO_HOLIDAYS,
    );
    expect(types.vacation).toMatchObject({
      usedDays: 5,
      pendingDays: 2,
      remainingDays: 20,
    });
  });

  it("counts only the days inside the year, with no carry-over", () => {
    const ranges: BalanceRange[] = [
      {
        startDate: "2026-12-28",
        endDate: "2027-01-08",
        type: "vacation",
        status: "approved",
      },
    ];
    expect(
      summarizeBalance(allowances, ranges, NO_HOLIDAYS).types.vacation,
    ).toMatchObject({ usedDays: 4, remainingDays: 21 });
    expect(
      summarizeBalance({ ...allowances, year: 2027 }, ranges, NO_HOLIDAYS).types
        .vacation,
    ).toMatchObject({ usedDays: 6, remainingDays: 19 });
  });

  it("lets remaining days go negative", () => {
    expect(
      summarizeBalance(
        { ...allowances, overrides: { vacation: 3 } },
        [{ ...week, type: "vacation", status: "approved" }],
        NO_HOLIDAYS,
      ).types.vacation,
    ).toMatchObject({ usedDays: 5, remainingDays: -2 });
  });

  it("leaves a weekday holiday out of a vacation", () => {
    const holidays = new Set(["2026-11-18"]);
    expect(
      summarizeBalance(
        allowances,
        [{ ...week, type: "vacation", status: "approved" }],
        holidays,
      ).types.vacation,
    ).toMatchObject({ usedDays: 4, remainingDays: 21 });
  });

  it("uses a calendar's weekday holidays of the year as public holidays", () => {
    // Friday Jan 1, Saturday Jan 2, Wednesday Jan 6 of 2027, and a 2026 day.
    const holidays = new Set([
      "2026-12-25",
      "2027-01-01",
      "2027-01-02",
      "2027-01-06",
    ]);
    const { types } = summarizeBalance(
      { ...allowances, year: 2027 },
      [],
      holidays,
    );
    expect(types.public_holiday).toMatchObject({
      usedDays: 2,
      remainingDays: 8,
    });
    expect(types.vacation.usedDays).toBe(0);
  });

  it("never counts a public_holiday request on a calendar holiday twice", () => {
    const holidays = new Set(["2026-11-18"]);
    expect(
      summarizeBalance(
        allowances,
        [
          {
            startDate: "2026-11-18",
            endDate: "2026-11-19",
            type: "public_holiday",
            status: "approved",
          },
        ],
        holidays,
      ).types.public_holiday,
    ).toMatchObject({ usedDays: 2, remainingDays: 8 });
  });
});
