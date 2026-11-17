import type { DayRange } from "./day-range";
import type { TimeOffStatus } from "./time-off-kinds";

export type TimeOffSnapshot = DayRange & { status: TimeOffStatus };

const DAY_MS = 86_400_000;

// Whether a committed change moved approved days that a plan may still use:
// the request became approved, stopped being approved, or approved dates
// changed, and some affected range ends on or after yesterday (UTC). Every
// local day is within a day of the UTC one. Pending changes never qualify,
// so planning never reveals them.
export function scheduleRefreshNeeded(
  before: TimeOffSnapshot | null,
  after: TimeOffSnapshot,
  today: string,
) {
  const wasApproved = before?.status === "approved";
  const isApproved = after.status === "approved";
  if (
    wasApproved &&
    isApproved &&
    before.startDate === after.startDate &&
    before.endDate === after.endDate
  ) {
    return false;
  }
  const ends = [
    ...(wasApproved ? [before.endDate] : []),
    ...(isApproved ? [after.endDate] : []),
  ];
  const yesterday = new Date(Date.parse(today) - DAY_MS)
    .toISOString()
    .slice(0, 10);
  return ends.some((end) => end >= yesterday);
}
