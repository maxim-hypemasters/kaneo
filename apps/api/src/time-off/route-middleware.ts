import { requireEntitlement } from "../billing/require-entitlement-middleware";
import {
  requireAnyWorkspacePermission,
  requireWorkspacePermission,
} from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";

// Route middleware for time off. Routes check the broad permission; the
// controllers decide own-versus-other with the viewer.
const anyTimeOff = requireAnyWorkspacePermission([
  { time_off: ["read"] },
  { time_off: ["create"] },
  { time_off: ["approve"] },
]);
const createOrApprove = requireAnyWorkspacePermission([
  { time_off: ["create"] },
  { time_off: ["approve"] },
]);
const approve = requireWorkspacePermission({ time_off: ["approve"] });

export const teamRead = [
  workspaceAccess.fromParam(),
  requireWorkspacePermission({ time_off: ["read"] }),
] as const;
export const ownRead = [workspaceAccess.fromParam(), anyTimeOff] as const;
export const approverRead = [workspaceAccess.fromParam(), approve] as const;
export const approverWrite = [...approverRead, requireEntitlement] as const;
export const workspaceCreate = [
  workspaceAccess.fromParam(),
  createOrApprove,
  requireEntitlement,
] as const;
export const requestRead = [workspaceAccess.fromTimeOff(), anyTimeOff] as const;
export const requestWrite = [
  workspaceAccess.fromTimeOff(),
  createOrApprove,
  requireEntitlement,
] as const;
export const requestDecide = [
  workspaceAccess.fromTimeOff(),
  approve,
  requireEntitlement,
] as const;
