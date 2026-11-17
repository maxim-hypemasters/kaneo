import db from "../database";
import { timeOffTable } from "../database/schema";
import { retryTransaction } from "../utils/retry-transaction";
import {
  assertNoOverlap,
  assertWorkspaceMember,
  lockTimeOffMember,
} from "./access";
import { NO_HOLIDAYS } from "./count-workdays";
import { readHolidayDays } from "./holidays/read-holiday-days";
import { publishTimeOffChange } from "./publish-time-off-change";
import { rangeYears } from "./range-years";
import type { CreateTimeOffInput } from "./schema";
import { timeOffRequestResult } from "./time-off-request-result";
import {
  assertHasWorkday,
  validateTimeOffRange,
} from "./validate-time-off-range";
import { assertCanActFor, type TimeOffViewer } from "./viewer";

// Every request starts pending, including an approver's own. Requesting for
// yourself needs create; recording time off for another member needs
// approve. The target must be a current member either way.
export async function createTimeOffRequest(
  viewer: TimeOffViewer,
  body: CreateTimeOffInput,
) {
  const userId = body.userId ?? viewer.userId;
  assertCanActFor(viewer, userId);
  const range = { startDate: body.startDate, endDate: body.endDate };
  validateTimeOffRange(range, viewer.today);

  const row = await retryTransaction(() =>
    db.transaction(async (tx) => {
      await lockTimeOffMember(tx, viewer.workspaceId, userId);
      await assertWorkspaceMember(tx, viewer.workspaceId, userId);
      const holidays = await readHolidayDays(
        tx,
        viewer.workspaceId,
        [userId],
        rangeYears(range),
      );
      assertHasWorkday(range, holidays.get(userId) ?? NO_HOLIDAYS);
      await assertNoOverlap(tx, viewer.workspaceId, userId, range);
      const [created] = await tx
        .insert(timeOffTable)
        .values({
          workspaceId: viewer.workspaceId,
          userId,
          type: body.type,
          status: "pending",
          ...range,
          note: body.note || null,
          createdBy: viewer.userId,
        })
        .returning();
      return created!;
    }),
  );
  await publishTimeOffChange({
    before: null,
    after: row,
    actorId: viewer.userId,
    today: viewer.today,
  });
  return timeOffRequestResult(viewer, row);
}
