import type { TimeOffView } from "@/lib/time-off/time-off-view";

export const TIME_OFF_VIEW_LABEL_KEYS = {
  team: "team:timeOff.views.team",
  mine: "team:timeOff.views.mine",
  approvals: "team:timeOff.views.approvals",
  balances: "team:timeOff.views.balances",
} as const satisfies Record<TimeOffView, string>;
