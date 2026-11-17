import { eq } from "drizzle-orm";
import db from "../database";
import { timeOffTable } from "../database/schema";
import { retryTransaction } from "../utils/retry-transaction";
import { findTimeOff } from "./access";
import {
  assertCanCancel,
  assertTimeOffVisible,
} from "./assert-time-off-action";
import { planningKeyChange } from "./planning-key";
import { publishTimeOffChange } from "./publish-time-off-change";
import { timeOffRequestResult } from "./time-off-request-result";
import type { TimeOffViewer } from "./viewer";

// Cancelling keeps the row as history. Approvers cancel anything open;
// requesters cancel pending requests, and approved ones through their first
// day (UTC).
export async function cancelTimeOffRequest(viewer: TimeOffViewer, id: string) {
  const { before, after } = await retryTransaction(() =>
    db.transaction(async (tx) => {
      const before = await findTimeOff(tx, viewer.workspaceId, id, true);
      assertTimeOffVisible(before, viewer);
      assertCanCancel(before, viewer);
      const [after] = await tx
        .update(timeOffTable)
        .set({
          status: "cancelled",
          statusChangedBy: viewer.userId,
          statusChangedAt: new Date(),
          ...planningKeyChange(
            before.id,
            before,
            { ...before, status: "cancelled" },
            viewer.today,
          ),
        })
        .where(eq(timeOffTable.id, before.id))
        .returning();
      return { before, after: after! };
    }),
  );
  await publishTimeOffChange({
    before,
    after,
    actorId: viewer.userId,
    today: viewer.today,
  });
  return timeOffRequestResult(viewer, after);
}
