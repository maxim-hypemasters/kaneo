// Each type has its own yearly allowance.
export const TIME_OFF_TYPES = ["vacation", "sick", "public_holiday"] as const;

export const TIME_OFF_STATUSES = [
  "pending",
  "approved",
  "declined",
  "cancelled",
] as const;

export type TimeOffType = (typeof TIME_OFF_TYPES)[number];

export type TimeOffStatus = (typeof TIME_OFF_STATUSES)[number];
