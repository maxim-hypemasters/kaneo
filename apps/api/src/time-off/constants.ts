import type { TimeOffType } from "./time-off-kinds";

// Each type's allowance for a workspace without a time_off_policy row for it.
export const DEFAULT_ALLOWANCE_DAYS = {
  vacation: 25,
  sick: 10,
  public_holiday: 10,
} as const satisfies Record<TimeOffType, number>;

export const NOTE_MAX = 500;

// The longest request, and the longest calendar window, in calendar days.
export const MAX_RANGE_DAYS = 366;
