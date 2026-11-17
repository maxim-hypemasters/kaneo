import { and, asc, eq, gte, lte, or } from "drizzle-orm";
import db from "../database";
import { timeOffTable } from "../database/schema";
import { ApiError } from "../errors/api-error";
import { heldByCurrentMember } from "./access";
import { calendarDayCount } from "./calendar-day-count";
import { MAX_RANGE_DAYS } from "./constants";
import { NO_HOLIDAYS } from "./count-workdays";
import { toHolidayDays, yearsWindow } from "./holidays/holiday-days";
import { readMemberHolidays } from "./holidays/read-member-holidays";
import { visibleHolidays } from "./holidays/visible-holidays";
import { presentEntry } from "./present-time-off";
import { rangeYears } from "./range-years";
import type { TimeOffViewer } from "./viewer";

// Approved time off of current members in the window, plus pending requests
// that are the viewer's own or that the viewer can decide, and every current
// member's calendar holidays in the window. Other people's entries and
// holidays carry only who and when unless the viewer can approve.
export async function listTimeOffCalendar(
  viewer: TimeOffViewer,
  query: { from: string; to: string; lang?: string },
) {
  const { from, to, lang } = query;
  if (from > to || calendarDayCount(from, to) > MAX_RANGE_DAYS) {
    throw new ApiError(400, {
      code: "TIME_OFF_RANGE",
      message: `The window must run forward and span at most ${MAX_RANGE_DAYS} days`,
    });
  }
  const pendingVisible = viewer.canApprove
    ? eq(timeOffTable.status, "pending")
    : and(
        eq(timeOffTable.status, "pending"),
        eq(timeOffTable.userId, viewer.userId),
      );
  const rows = await db
    .select()
    .from(timeOffTable)
    .where(
      and(
        eq(timeOffTable.workspaceId, viewer.workspaceId),
        or(eq(timeOffTable.status, "approved"), pendingVisible),
        lte(timeOffTable.startDate, to),
        gte(timeOffTable.endDate, from),
        heldByCurrentMember(),
      ),
    )
    .orderBy(
      asc(timeOffTable.startDate),
      asc(timeOffTable.userId),
      asc(timeOffTable.id),
    );
  // Whole years of the window and of each entry's own range, so an entry
  // crossing the window edge counts the same days in every window.
  const { byUser } = await readMemberHolidays(
    db,
    viewer.workspaceId,
    null,
    yearsWindow(rangeYears({ startDate: from, endDate: to }, ...rows)),
    lang,
  );
  const days = toHolidayDays(byUser);
  return {
    workspaceId: viewer.workspaceId,
    from,
    to,
    entries: rows.map((row) =>
      presentEntry(row, viewer, days.get(row.userId) ?? NO_HOLIDAYS),
    ),
    holidays: visibleHolidays(byUser, viewer, { from, to }),
  };
}
