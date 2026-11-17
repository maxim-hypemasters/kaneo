import db from "../database";
import { timeOffPolicyTable } from "../database/schema";
import { publishTimeOffSettingsChange } from "./publish-time-off-change";
import { readDefaultAllowances } from "./read-balances";
import type { TimeOffType } from "./time-off-kinds";
import { assertTimeOffApprover, type TimeOffViewer } from "./viewer";

// One type's default, one value for every year, so past balances follow it
// too.
export async function setDefaultTimeOffAllowance(
  viewer: TimeOffViewer,
  type: TimeOffType,
  days: number,
) {
  assertTimeOffApprover(viewer);
  const previous = (await readDefaultAllowances(db, viewer.workspaceId))[type];
  await db
    .insert(timeOffPolicyTable)
    .values({
      workspaceId: viewer.workspaceId,
      type,
      defaultAllowanceDays: days,
    })
    .onConflictDoUpdate({
      target: [timeOffPolicyTable.workspaceId, timeOffPolicyTable.type],
      set: { defaultAllowanceDays: days, updatedAt: new Date() },
    });
  if (previous !== days) await publishTimeOffSettingsChange(viewer.workspaceId);
  return { workspaceId: viewer.workspaceId, type, defaultAllowanceDays: days };
}
