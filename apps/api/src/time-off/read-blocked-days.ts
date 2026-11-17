import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { timeOffTable } from "../database/schema";
import { addDays } from "../scheduling/engine/zoned-time";
import { heldByCurrentMember, type TimeOffTransaction } from "./access";
import { calendarDayCount } from "./calendar-day-count";
import { readMemberHolidays } from "./holidays/read-member-holidays";

// The planning horizon (3660 days) with some slack.
const MAX_WINDOW_DAYS = 3700;

// The days in [from, to] (inclusive YYYY-MM-DD) on which each member is away
// and can't be given work: approved time off of any type, plus the public
// holidays of their calendar. Pending requests never count; they are private
// to the member and approvers. Current members only, as on the team calendar.
// Every query runs on `tx`, so a task mutation never takes a second pool
// connection.
export async function readBlockedDays(
  tx: TimeOffTransaction,
  workspaceId: string,
  userIds: readonly string[],
  window: { from: string; to: string },
): Promise<Map<string, Set<string>>> {
  const members = [...new Set(userIds)];
  const blocked = new Map<string, Set<string>>();
  const { from, to } = window;
  if (!members.length || from > to) return blocked;
  if (calendarDayCount(from, to) > MAX_WINDOW_DAYS)
    throw new Error(`Blocked days are read ${MAX_WINDOW_DAYS} days at most`);
  const add = (userId: string, day: string) => {
    const days = blocked.get(userId) ?? new Set<string>();
    days.add(day);
    blocked.set(userId, days);
  };

  const approved = await tx
    .select({
      userId: timeOffTable.userId,
      startDate: timeOffTable.startDate,
      endDate: timeOffTable.endDate,
    })
    .from(timeOffTable)
    .where(
      and(
        eq(timeOffTable.workspaceId, workspaceId),
        inArray(timeOffTable.userId, members),
        eq(timeOffTable.status, "approved"),
        lte(timeOffTable.startDate, to),
        gte(timeOffTable.endDate, from),
        heldByCurrentMember(timeOffTable, tx),
      ),
    );
  for (const range of approved) {
    const last = range.endDate < to ? range.endDate : to;
    for (
      let day = range.startDate > from ? range.startDate : from;
      day <= last;
      day = addDays(day, 1)
    )
      add(range.userId, day);
  }

  const { byUser } = await readMemberHolidays(tx, workspaceId, members, window);
  for (const [userId, holidays] of byUser)
    for (const holiday of holidays) add(userId, holiday.date);
  return blocked;
}
