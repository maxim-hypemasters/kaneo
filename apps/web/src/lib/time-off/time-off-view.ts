export const TIME_OFF_VIEWS = [
  "team",
  "mine",
  "approvals",
  "balances",
] as const;
export type TimeOffView = (typeof TIME_OFF_VIEWS)[number];

export function isTimeOffView(value: unknown): value is TimeOffView {
  return TIME_OFF_VIEWS.some((view) => view === value);
}

export type TimeOffViewAccess = {
  canView: boolean;
  canRequest: boolean;
  canApprove: boolean;
};

// The Team timeline needs time_off:read. Your own requests need any time-off
// permission, since an approver can record time off for anyone. Approvals
// and Balances are for approvers.
export function availableTimeOffViews({
  canView,
  canRequest,
  canApprove,
}: TimeOffViewAccess): TimeOffView[] {
  const views: TimeOffView[] = [];
  if (canView) views.push("team");
  if (canView || canRequest || canApprove) views.push("mine");
  if (canApprove) views.push("approvals", "balances");
  return views;
}

// The requested view when it is available, otherwise the first one; null
// without any time-off permission.
export function resolveTimeOffView(
  requested: TimeOffView | undefined,
  available: readonly TimeOffView[],
): TimeOffView | null {
  if (requested && available.includes(requested)) return requested;
  return available[0] ?? null;
}
