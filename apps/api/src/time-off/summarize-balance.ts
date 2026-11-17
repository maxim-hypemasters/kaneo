import type { DayRange } from "./day-range";
import {
  TIME_OFF_TYPES,
  type TimeOffStatus,
  type TimeOffType,
} from "./time-off-kinds";
import { weekdayHolidaysInYear } from "./weekday-holidays-in-year";
import { workdaysInYear } from "./workdays-in-year";

export type TimeOffTypeBalance = {
  allowanceDays: number;
  allowanceSource: "default" | "override";
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
};

export type TimeOffBalance = {
  workspaceId: string;
  userId: string;
  year: number;
  types: Record<TimeOffType, TimeOffTypeBalance>;
};

export type BalanceAllowances = {
  workspaceId: string;
  userId: string;
  year: number;
  // The workspace default of every type.
  defaults: Readonly<Record<TimeOffType, number>>;
  // The member's own allowance, for the types they have one.
  overrides: Readonly<Partial<Record<TimeOffType, number>>>;
};

export type BalanceRange = DayRange & {
  type: TimeOffType;
  status: TimeOffStatus;
};

// One member's balances for one Jan-Dec year, one per type. A range counts
// only toward its own type: approved working days are used, pending ones are
// reported separately and not subtracted, so remaining days can go negative.
// Declined and cancelled ranges count nothing. The member's calendar
// holidays never count as days of a range; their weekday holidays of the
// year are used public_holiday days instead. `holidays` must cover the
// whole year.
export function summarizeBalance(
  allowances: BalanceAllowances,
  ranges: readonly BalanceRange[],
  holidays: ReadonlySet<string>,
): TimeOffBalance {
  const { workspaceId, userId, year, defaults, overrides } = allowances;
  const types = {} as Record<TimeOffType, TimeOffTypeBalance>;
  for (const type of TIME_OFF_TYPES) {
    const override = overrides[type];
    const allowanceDays = override ?? defaults[type];
    let usedDays =
      type === "public_holiday" ? weekdayHolidaysInYear(holidays, year) : 0;
    let pendingDays = 0;
    for (const range of ranges) {
      if (range.type !== type) continue;
      if (range.status === "approved")
        usedDays += workdaysInYear(range, year, holidays);
      if (range.status === "pending")
        pendingDays += workdaysInYear(range, year, holidays);
    }
    types[type] = {
      allowanceDays,
      allowanceSource: override === undefined ? "default" : "override",
      usedDays,
      pendingDays,
      remainingDays: allowanceDays - usedDays,
    };
  }
  return { workspaceId, userId, year, types };
}
