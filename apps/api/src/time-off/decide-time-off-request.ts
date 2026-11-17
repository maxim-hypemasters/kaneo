import { eq } from "drizzle-orm";
import db from "../database";
import { timeOffTable } from "../database/schema";
import { retryTransaction } from "../utils/retry-transaction";
import { findTimeOff } from "./access";
import { assertCanDecide } from "./assert-time-off-action";
import { planningKeyChange } from "./planning-key";
import { publishTimeOffChange } from "./publish-time-off-change";
import { timeOffRequestResult } from "./time-off-request-result";
import { assertTimeOffApprover, type TimeOffViewer } from "./viewer";

// Approves or declines a pending request at the version the approver
// reviewed. Approvers may decide their own requests.
export async function decideTimeOffRequest(
  viewer: TimeOffViewer,
  id: string,
  decision: "approved" | "declined",
  version: number,
) {
  assertTimeOffApprover(viewer);
  const { before, after } = await retryTransaction(() =>
    db.transaction(async (tx) => {
      const before = await findTimeOff(tx, viewer.workspaceId, id, true);
      assertCanDecide(before, viewer, version);
      const [after] = await tx
        .update(timeOffTable)
        .set({
          status: decision,
          statusChangedBy: viewer.userId,
          statusChangedAt: new Date(),
          ...planningKeyChange(
            before.id,
            before,
            { ...before, status: decision },
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
