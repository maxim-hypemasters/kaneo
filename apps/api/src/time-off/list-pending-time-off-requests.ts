import { and, asc, eq } from "drizzle-orm";
import db from "../database";
import { timeOffTable } from "../database/schema";
import { heldByCurrentMember } from "./access";
import { NO_HOLIDAYS } from "./count-workdays";
import { readHolidayDays } from "./holidays/read-holiday-days";
import { overAllowanceDays } from "./over-allowance-days";
import { presentRequest } from "./present-time-off";
import { rangeYears } from "./range-years";
import { readTimeOffBalances } from "./read-balances";
import { assertTimeOffApprover, type TimeOffViewer } from "./viewer";

// Requests waiting for a decision, oldest first, each with the requester's
// balances for the years it touches.
export async function listPendingTimeOffRequests(viewer: TimeOffViewer) {
  assertTimeOffApprover(viewer);
  const rows = await db
    .select()
    .from(timeOffTable)
    .where(
      and(
        eq(timeOffTable.workspaceId, viewer.workspaceId),
        eq(timeOffTable.status, "pending"),
        heldByCurrentMember(),
      ),
    )
    .orderBy(asc(timeOffTable.createdAt), asc(timeOffTable.id));
  const userIds = [...new Set(rows.map((row) => row.userId))];
  const allYears = rangeYears(...rows);
  // Whole years, read once: the presenter and the balances share them.
  const holidays = await readHolidayDays(
    db,
    viewer.workspaceId,
    userIds,
    allYears,
  );
  const balances = await readTimeOffBalances(
    db,
    viewer.workspaceId,
    userIds,
    allYears,
    holidays,
  );
  return {
    workspaceId: viewer.workspaceId,
    requests: rows.map((row) => {
      const years = rangeYears(row);
      const own = balances.filter(
        (balance) =>
          balance.userId === row.userId && years.includes(balance.year),
      );
      const memberHolidays = holidays.get(row.userId) ?? NO_HOLIDAYS;
      return {
        ...presentRequest(row, viewer, memberHolidays),
        balances: own,
        overAllowanceDays: overAllowanceDays(row, own, memberHolidays),
      };
    }),
  };
}
