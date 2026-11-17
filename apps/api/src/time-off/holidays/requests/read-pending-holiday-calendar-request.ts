import { and, eq } from "drizzle-orm";
import { timeOffHolidayCalendarRequestTable } from "../../../database/schema";
import { heldByCurrentMember, type Reader } from "../../access";
import type { HolidayCalendarRequestRow } from "./present-holiday-calendar-request";

// A current member's pending calendar request, or null. Runs only on
// `reader`; writers hold the member lock, so no row lock is needed.
export async function readPendingHolidayCalendarRequest(
  reader: Reader,
  workspaceId: string,
  userId: string,
): Promise<HolidayCalendarRequestRow | null> {
  const [row] = await reader
    .select()
    .from(timeOffHolidayCalendarRequestTable)
    .where(
      and(
        eq(timeOffHolidayCalendarRequestTable.workspaceId, workspaceId),
        eq(timeOffHolidayCalendarRequestTable.userId, userId),
        eq(timeOffHolidayCalendarRequestTable.status, "pending"),
        heldByCurrentMember(timeOffHolidayCalendarRequestTable, reader),
      ),
    );
  return row ?? null;
}
