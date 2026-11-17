import { and, eq } from "drizzle-orm";
import db from "../database";
import { timeOffAllowanceTable } from "../database/schema";
import { assertWorkspaceMember } from "./access";
import { publishTimeOffSettingsChange } from "./publish-time-off-change";
import { readTimeOffBalances } from "./read-balances";
import type { TimeOffBalance } from "./summarize-balance";
import type { TimeOffType } from "./time-off-kinds";
import { assertTimeOffApprover, type TimeOffViewer } from "./viewer";

// A member's own allowance of one type, for every year. Returns their
// balance for the current year.
export async function setTimeOffAllowanceOverride(
  viewer: TimeOffViewer,
  userId: string,
  type: TimeOffType,
  days: number,
): Promise<TimeOffBalance> {
  assertTimeOffApprover(viewer);
  await assertWorkspaceMember(db, viewer.workspaceId, userId);
  const [previous] = await db
    .select({ days: timeOffAllowanceTable.days })
    .from(timeOffAllowanceTable)
    .where(
      and(
        eq(timeOffAllowanceTable.workspaceId, viewer.workspaceId),
        eq(timeOffAllowanceTable.userId, userId),
        eq(timeOffAllowanceTable.type, type),
      ),
    );
  await db
    .insert(timeOffAllowanceTable)
    .values({ workspaceId: viewer.workspaceId, userId, type, days })
    .onConflictDoUpdate({
      target: [
        timeOffAllowanceTable.workspaceId,
        timeOffAllowanceTable.userId,
        timeOffAllowanceTable.type,
      ],
      set: { days, updatedAt: new Date() },
    });
  if (previous?.days !== days)
    await publishTimeOffSettingsChange(viewer.workspaceId);
  const [balance] = await readTimeOffBalances(
    db,
    viewer.workspaceId,
    [userId],
    [Number(viewer.today.slice(0, 4))],
  );
  return balance!;
}
