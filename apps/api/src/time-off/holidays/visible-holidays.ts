import type { MemberHoliday } from "./resolve-holidays";

export type VisibleHoliday = { userId: string; date: string; name?: string };

// Calendar holidays inside [from, to], by date then member. Names are only for
// the member themselves and for approvers: everyone else sees who and when,
// the same as a redacted entry.
export function visibleHolidays(
  byUser: ReadonlyMap<string, readonly MemberHoliday[]>,
  viewer: { userId: string; canApprove: boolean },
  window: { from: string; to: string },
): VisibleHoliday[] {
  const visible: VisibleHoliday[] = [];
  for (const [userId, holidays] of byUser) {
    const named = userId === viewer.userId || viewer.canApprove;
    for (const { date, name } of holidays) {
      if (date < window.from || date > window.to) continue;
      visible.push(named ? { userId, date, name } : { userId, date });
    }
  }
  // Dates have a fixed width, so the joined key sorts by date, then member.
  const key = (holiday: VisibleHoliday) => `${holiday.date} ${holiday.userId}`;
  return visible.sort((a, b) => (key(a) < key(b) ? -1 : 1));
}
