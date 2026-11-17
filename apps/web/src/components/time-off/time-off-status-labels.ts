import type { TimeOffStatus } from "@/fetchers/time-off/types";

export const TIME_OFF_STATUS_LABEL_KEYS = {
  pending: "team:timeOff.status.pending",
  approved: "team:timeOff.status.approved",
  declined: "team:timeOff.status.declined",
  cancelled: "team:timeOff.status.cancelled",
} as const satisfies Record<TimeOffStatus, string>;
