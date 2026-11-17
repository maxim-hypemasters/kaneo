import {
  scheduleRefreshNeeded,
  type TimeOffSnapshot,
} from "./schedule-refresh-needed";

// The planning_key to write with a change, or nothing to keep the stored one.
// It moves exactly when a schedule refresh is published, so the plan
// fingerprint (read-approved-time-off.ts) ignores retroactive approvals and
// edits or cancels of time off that had already ended.
export function planningKeyChange(
  id: string,
  before: TimeOffSnapshot | null,
  after: TimeOffSnapshot,
  today: string,
): { planningKey: string | null } | Record<string, never> {
  if (!scheduleRefreshNeeded(before, after, today)) return {};
  return {
    planningKey:
      after.status === "approved"
        ? `${id}:${after.startDate}:${after.endDate}`
        : null,
  };
}
