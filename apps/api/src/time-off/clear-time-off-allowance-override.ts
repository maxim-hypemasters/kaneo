import { and, eq } from "drizzle-orm";
import db from "../database";
import { timeOffAllowanceTable } from "../database/schema";
import { assertWorkspaceMember } from "./access";
import { publishTimeOffSettingsChange } from "./publish-time-off-change";
import { readTimeOffBalances } from "./read-balances";
import type { TimeOffBalance } from "./summarize-balance";
import type { TimeOffType } from "./time-off-kinds";
import { assertTimeOffApprover, type TimeOffViewer } from "./viewer";

// Puts the member back on the workspace default of one type. Clearing twice
// is fine. Returns their balance for the current year.
export async function clearTimeOffAllowanceOverride(
  viewer: TimeOffViewer,
  userId: string,
  type: TimeOffType,
): Promise<TimeOffBalance> {
  assertTimeOffApprover(viewer);
  await assertWorkspaceMember(db, viewer.workspaceId, userId);
  const removed = await db
    .delete(timeOffAllowanceTable)
    .where(
      and(
        eq(timeOffAllowanceTable.workspaceId, viewer.workspaceId),
        eq(timeOffAllowanceTable.userId, userId),
        eq(timeOffAllowanceTable.type, type),
      ),
    )
    .returning({ id: timeOffAllowanceTable.id });
  if (removed.length > 0)
    await publishTimeOffSettingsChange(viewer.workspaceId);
  const [balance] = await readTimeOffBalances(
    db,
    viewer.workspaceId,
    [userId],
    [Number(viewer.today.slice(0, 4))],
  );
  return balance!;
}
