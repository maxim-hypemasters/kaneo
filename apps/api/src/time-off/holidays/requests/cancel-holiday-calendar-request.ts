import { eq } from "drizzle-orm";
import db from "../../../database";
import { timeOffHolidayCalendarRequestTable as requests } from "../../../database/schema";
import { retryTransaction } from "../../../utils/retry-transaction";
import { publishHolidayCalendarRequestChange } from "../../publish-time-off-change";
import { timeOffStatusError } from "../../time-off-errors";
import type { TimeOffViewer } from "../../viewer";
import { assertCanCancelHolidayCalendarRequest } from "./assert-can-cancel-holiday-calendar-request";
import { findHolidayCalendarRequest } from "./find-holiday-calendar-request";
import { presentHolidayCalendarRequest } from "./present-holiday-calendar-request";

// Withdraws a pending calendar request; the calendar stays as it is and the
// row stays as history.
export async function cancelHolidayCalendarRequest(
  viewer: TimeOffViewer,
  id: string,
) {
  const { before, after } = await retryTransaction(() =>
    db.transaction(async (tx) => {
      const before = await findHolidayCalendarRequest(
        tx,
        viewer.workspaceId,
        id,
      );
      assertCanCancelHolidayCalendarRequest(before, viewer);
      if (before.status !== "pending") throw timeOffStatusError(before.status);
      const [after] = await tx
        .update(requests)
        .set({
          status: "cancelled",
          statusChangedBy: viewer.userId,
          statusChangedAt: new Date(),
        })
        .where(eq(requests.id, before.id))
        .returning();
      return { before, after: after! };
    }),
  );
  await publishHolidayCalendarRequestChange({
    workspaceId: after.workspaceId,
    requestId: after.id,
    userId: after.userId,
    actorId: viewer.userId,
    previousStatus: before.status,
    status: after.status,
  });
  return presentHolidayCalendarRequest(after);
}
