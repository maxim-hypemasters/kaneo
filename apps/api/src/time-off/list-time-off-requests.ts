import { and, desc, eq, gte, lte } from "drizzle-orm";
import db from "../database";
import { timeOffTable } from "../database/schema";
import { heldByCurrentMember } from "./access";
import { NO_HOLIDAYS } from "./count-workdays";
import { readHolidayDays } from "./holidays/read-holiday-days";
import { presentRequest } from "./present-time-off";
import { rangeYears } from "./range-years";
import { assertCanViewMember, type TimeOffViewer } from "./viewer";

// One member's requests of every status that touch the year, latest first.
export async function listTimeOffRequests(
  viewer: TimeOffViewer,
  query: { userId?: string; year?: number },
) {
  const userId = query.userId ?? viewer.userId;
  assertCanViewMember(viewer, userId);
  const year = query.year ?? Number(viewer.today.slice(0, 4));
  const rows = await db
    .select()
    .from(timeOffTable)
    .where(
      and(
        eq(timeOffTable.workspaceId, viewer.workspaceId),
        eq(timeOffTable.userId, userId),
        lte(timeOffTable.startDate, `${year}-12-31`),
        gte(timeOffTable.endDate, `${year}-01-01`),
        heldByCurrentMember(),
      ),
    )
    .orderBy(desc(timeOffTable.startDate), desc(timeOffTable.createdAt));
  const holidays = await readHolidayDays(
    db,
    viewer.workspaceId,
    [userId],
    rangeYears(...rows),
  );
  return {
    workspaceId: viewer.workspaceId,
    requests: rows.map((row) =>
      presentRequest(row, viewer, holidays.get(userId) ?? NO_HOLIDAYS),
    ),
  };
}
