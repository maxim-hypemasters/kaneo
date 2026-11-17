import db from "../database";
import { readDefaultAllowances } from "./read-balances";
import { assertTimeOffApprover, type TimeOffViewer } from "./viewer";

// The workspace default of each type, which members without their own
// allowance follow.
export async function getTimeOffAllowanceDefaults(viewer: TimeOffViewer) {
  assertTimeOffApprover(viewer);
  return {
    workspaceId: viewer.workspaceId,
    defaultAllowances: await readDefaultAllowances(db, viewer.workspaceId),
  };
}
