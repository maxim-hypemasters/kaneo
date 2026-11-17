import { eq } from "drizzle-orm";
import db from "../../../database";
import { timeOffHolidayCalendarRequestTable as requests } from "../../../database/schema";
import { retryTransaction } from "../../../utils/retry-transaction";
import {
  publishHolidayCalendarChange,
  publishHolidayCalendarRequestChange,
} from "../../publish-time-off-change";
import {
  timeOffChangedError,
  timeOffStatusError,
  unknownHolidayCalendar,
} from "../../time-off-errors";
import { assertTimeOffApprover, type TimeOffViewer } from "../../viewer";
import { isValidHolidayCalendar } from "../catalog";
import { holidayCalendarCode } from "../holiday-calendar-code";
import { readHolidayCalendarChoice } from "../read-holiday-calendar-choice";
import { sameHolidayCalendar } from "../same-holiday-calendar";
import { writeHolidayCalendar } from "../write-holiday-calendar";
import { findHolidayCalendarRequest } from "./find-holiday-calendar-request";
import { presentHolidayCalendarRequest } from "./present-holiday-calendar-request";

// Approves or declines a pending calendar request at the version the
// approver reviewed. Approving applies the target unless the member already
// has it. Approvers may decide their own requests.
export async function decideHolidayCalendarRequest(
  viewer: TimeOffViewer,
  id: string,
  decision: "approved" | "declined",
  version: number,
  lang?: string,
) {
  assertTimeOffApprover(viewer);
  const { before, after, written } = await retryTransaction(() =>
    db.transaction(async (tx) => {
      const before = await findHolidayCalendarRequest(
        tx,
        viewer.workspaceId,
        id,
      );
      if (before.status !== "pending") throw timeOffStatusError(before.status);
      if (before.version !== version) throw timeOffChangedError();
      let written = false;
      if (decision === "approved") {
        const target = holidayCalendarCode(before);
        // The holiday data may have changed since the member asked.
        if (target && !isValidHolidayCalendar(target))
          throw unknownHolidayCalendar();
        const choice = await readHolidayCalendarChoice(
          tx,
          before.workspaceId,
          before.userId,
        );
        written = !(
          choice.chosen && sameHolidayCalendar(choice.calendar, target)
        );
        if (written)
          await writeHolidayCalendar(
            tx,
            before.workspaceId,
            before.userId,
            target,
          );
      }
      const [after] = await tx
        .update(requests)
        .set({
          status: decision,
          statusChangedBy: viewer.userId,
          statusChangedAt: new Date(),
        })
        .where(eq(requests.id, before.id))
        .returning();
      return { before, after: after!, written };
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
  if (written)
    await publishHolidayCalendarChange(after.workspaceId, after.userId);
  return presentHolidayCalendarRequest(after, lang);
}
