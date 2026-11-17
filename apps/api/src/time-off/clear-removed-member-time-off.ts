import { and, eq, isNotNull } from "drizzle-orm";
import db from "../database";
import {
  timeOffHolidayCalendarRequestTable as calendarRequests,
  timeOffTable,
} from "../database/schema";
import { retryTransaction } from "../utils/retry-transaction";
import { isWorkspaceMember, lockTimeOffMember } from "./access";
import {
  publishHolidayCalendarRequestChange,
  publishTimeOffChange,
} from "./publish-time-off-change";

// After someone leaves a workspace: cancel their pending time off and
// holiday calendar requests so no approver is left deciding them, and drop
// the notes on all their rows there. Rows, their calendar included, stay as
// history and come back if the person is added again. Takes the member lock
// so a request created during the removal is cleared too.
export async function clearRemovedMemberTimeOff(
  workspaceId: string,
  userId: string,
) {
  const { cancelled, cancelledCalendarRequests } = await retryTransaction(() =>
    db.transaction(async (tx) => {
      await lockTimeOffMember(tx, workspaceId, userId);
      // Re-added already, or another membership row remains.
      if (await isWorkspaceMember(tx, workspaceId, userId))
        return { cancelled: [], cancelledCalendarRequests: [] };
      const member = and(
        eq(timeOffTable.workspaceId, workspaceId),
        eq(timeOffTable.userId, userId),
      );
      const cancel = {
        status: "cancelled" as const,
        statusChangedBy: null,
        statusChangedAt: new Date(),
      };
      const rows = await tx
        .update(timeOffTable)
        .set(cancel)
        .where(and(member, eq(timeOffTable.status, "pending")))
        .returning();
      await tx
        .update(timeOffTable)
        .set({ note: null })
        .where(and(member, isNotNull(timeOffTable.note)));
      const calendarRows = await tx
        .update(calendarRequests)
        .set(cancel)
        .where(
          and(
            eq(calendarRequests.workspaceId, workspaceId),
            eq(calendarRequests.userId, userId),
            eq(calendarRequests.status, "pending"),
          ),
        )
        .returning({ id: calendarRequests.id });
      return { cancelled: rows, cancelledCalendarRequests: calendarRows };
    }),
  );
  const today = new Date().toISOString().slice(0, 10);
  for (const row of cancelled)
    await publishTimeOffChange({
      before: { ...row, status: "pending" },
      after: row,
      actorId: null,
      today,
    });
  for (const { id } of cancelledCalendarRequests)
    await publishHolidayCalendarRequestChange({
      workspaceId,
      requestId: id,
      userId,
      actorId: null,
      previousStatus: "pending",
      status: "cancelled",
    });
}
