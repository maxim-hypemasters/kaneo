import type { Context } from "hono";
import db from "../database";
import { workspacePermissionChecker } from "../utils/require-workspace-permission";
import { isWorkspaceMember } from "./access";
import type { TimeOffActionViewer } from "./time-off-actions";
import { missingTimeOffPermission } from "./time-off-errors";

export type TimeOffViewer = TimeOffActionViewer & { workspaceId: string };

// Who is asking, and what they may do with time off. Both flags need actual
// membership: an instance admin outside the workspace passes the route
// middleware but only gets the redacted who-and-when view.
export async function timeOffViewer(c: Context): Promise<TimeOffViewer> {
  const workspaceId: string = c.get("workspaceId");
  const userId: string = c.get("userId");
  const [allowed, member] = await Promise.all([
    workspacePermissionChecker(c),
    isWorkspaceMember(db, workspaceId, userId),
  ]);
  return {
    workspaceId,
    userId,
    canApprove: member && allowed({ time_off: ["approve"] }),
    canCreate: member && allowed({ time_off: ["create"] }),
    today: new Date().toISOString().slice(0, 10),
  };
}

export function assertTimeOffApprover(viewer: TimeOffViewer) {
  if (!viewer.canApprove) throw missingTimeOffPermission("approve");
}

// Your own data needs any time_off permission (the route checks that);
// another member's needs approve.
export function assertCanViewMember(viewer: TimeOffViewer, userId: string) {
  if (userId !== viewer.userId) assertTimeOffApprover(viewer);
}

// Acting on your own time off needs create; acting for another member needs
// approve. The target must still be checked as a current member.
export function assertCanActFor(viewer: TimeOffViewer, userId: string) {
  if (userId !== viewer.userId) assertTimeOffApprover(viewer);
  else if (!viewer.canCreate) throw missingTimeOffPermission("create");
}
