import { sql } from "drizzle-orm";
import db from "../../database";
import { timeOffSettingTable } from "../../database/schema";
import { retryTransaction } from "../../utils/retry-transaction";
import { publishTimeOffSettingsChange } from "../publish-time-off-change";
import { assertTimeOffApprover, type TimeOffViewer } from "../viewer";
import { readHolidayCalendarDeadline } from "./read-holiday-calendar-deadline";
import type { TimeOffSettingsInput } from "./schema";

// Saves the workspace's time off settings. Changing the deadline leaves
// pending calendar requests as they are.
export async function setTimeOffSettings(
  viewer: TimeOffViewer,
  body: TimeOffSettingsInput,
) {
  assertTimeOffApprover(viewer);
  const { workspaceId } = viewer;
  const deadline = body.holidayCalendarDeadline;
  // Saves of one workspace run one at a time, so each compares with the
  // value the previous one wrote and the last change is always announced.
  // The row may not exist yet, so the lock is advisory, not FOR UPDATE.
  const previous = await retryTransaction(() =>
    db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`time-off-settings:${workspaceId}`}, 0))`,
      );
      const previous = await readHolidayCalendarDeadline(tx, workspaceId);
      await tx
        .insert(timeOffSettingTable)
        .values({ workspaceId, holidayCalendarDeadline: deadline })
        .onConflictDoUpdate({
          target: timeOffSettingTable.workspaceId,
          set: { holidayCalendarDeadline: deadline, updatedAt: new Date() },
        });
      return previous;
    }),
  );
  if (previous !== deadline) await publishTimeOffSettingsChange(workspaceId);
  return { workspaceId, holidayCalendarDeadline: deadline };
}
