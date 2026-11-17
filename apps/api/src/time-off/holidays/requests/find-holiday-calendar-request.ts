import { and, eq } from "drizzle-orm";
import { timeOffHolidayCalendarRequestTable as requests } from "../../../database/schema";
import {
  heldByCurrentMember,
  lockTimeOffMember,
  type Reader,
  type TimeOffTransaction,
} from "../../access";
import { holidayCalendarRequestNotFound } from "../../time-off-errors";
import type { HolidayCalendarRequestRow } from "./present-holiday-calendar-request";

async function readRequest(reader: Reader, workspaceId: string, id: string) {
  const [row] = await reader
    .select()
    .from(requests)
    .where(
      and(
        eq(requests.id, id),
        eq(requests.workspaceId, workspaceId),
        heldByCurrentMember(requests, reader),
      ),
    );
  return row;
}

// A current member's calendar request by id. The first read only learns
// whose it is; after taking that member's lock, the order every calendar
// writer uses, it reads again, so the row cannot change under the caller.
export async function findHolidayCalendarRequest(
  tx: TimeOffTransaction,
  workspaceId: string,
  id: string,
): Promise<HolidayCalendarRequestRow> {
  const first = await readRequest(tx, workspaceId, id);
  if (!first) throw holidayCalendarRequestNotFound();
  await lockTimeOffMember(tx, workspaceId, first.userId);
  const row = await readRequest(tx, workspaceId, id);
  if (!row) throw holidayCalendarRequestNotFound();
  return row;
}
