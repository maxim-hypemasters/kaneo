import { eq } from "drizzle-orm";
import db from "../database";
import { timeOffTable } from "../database/schema";
import { retryTransaction } from "../utils/retry-transaction";
import { assertNoOverlap, findTimeOff, lockTimeOffMember } from "./access";
import { assertCanEdit, assertTimeOffVisible } from "./assert-time-off-action";
import { NO_HOLIDAYS } from "./count-workdays";
import { readHolidayDays } from "./holidays/read-holiday-days";
import { planningKeyChange } from "./planning-key";
import { publishTimeOffChange } from "./publish-time-off-change";
import { rangeYears } from "./range-years";
import type { UpdateTimeOffInput } from "./schema";
import { timeOffRequestResult } from "./time-off-request-result";
import {
  assertHasWorkday,
  validateTimeOffRange,
} from "./validate-time-off-range";
import type { TimeOffViewer } from "./viewer";

// Requesters edit their pending requests; approvers edit pending or approved
// ones, and approved time off stays approved. New dates get every range
// check and the overlap check; an unchanged request is not written.
export async function updateTimeOffRequest(
  viewer: TimeOffViewer,
  id: string,
  body: UpdateTimeOffInput,
) {
  const { before, after } = await retryTransaction(() =>
    db.transaction(async (tx) => {
      // The requester never changes, so their lock can be taken before the
      // row lock, in the same order as creates.
      const seen = await findTimeOff(tx, viewer.workspaceId, id);
      assertTimeOffVisible(seen, viewer);
      await lockTimeOffMember(tx, viewer.workspaceId, seen.userId);
      const before = await findTimeOff(tx, viewer.workspaceId, id, true);
      assertCanEdit(before, viewer);

      const next = {
        type: body.type ?? before.type,
        startDate: body.startDate ?? before.startDate,
        endDate: body.endDate ?? before.endDate,
        note: body.note === undefined ? before.note : body.note || null,
      };
      validateTimeOffRange(next, viewer.today, before);
      const datesChanged =
        next.startDate !== before.startDate || next.endDate !== before.endDate;
      if (datesChanged) {
        const holidays = await readHolidayDays(
          tx,
          viewer.workspaceId,
          [before.userId],
          rangeYears(next),
        );
        assertHasWorkday(next, holidays.get(before.userId) ?? NO_HOLIDAYS);
        await assertNoOverlap(
          tx,
          viewer.workspaceId,
          before.userId,
          next,
          before.id,
        );
      }
      if (
        !datesChanged &&
        next.type === before.type &&
        next.note === before.note
      )
        return { before, after: null };

      const [after] = await tx
        .update(timeOffTable)
        .set({
          ...next,
          version: before.version + 1,
          ...planningKeyChange(
            before.id,
            before,
            { ...next, status: before.status },
            viewer.today,
          ),
        })
        .where(eq(timeOffTable.id, before.id))
        .returning();
      return { before, after: after! };
    }),
  );
  if (!after) return timeOffRequestResult(viewer, before);
  await publishTimeOffChange({
    before,
    after,
    actorId: viewer.userId,
    today: viewer.today,
  });
  return timeOffRequestResult(viewer, after, before);
}
