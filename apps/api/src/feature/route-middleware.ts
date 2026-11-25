import { requireEntitlement } from "../billing/require-entitlement-middleware";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";

export const read = [
  workspaceAccess.fromTask("id"),
  requireWorkspacePermission({ feature: ["read"] }),
] as const;
export const write = [
  workspaceAccess.fromTask("id"),
  requireWorkspacePermission({ feature: ["update"] }),
  requireEntitlement,
] as const;
export const removeDocument = [
  workspaceAccess.fromTask("id"),
  requireWorkspacePermission({ feature: ["delete"] }),
  requireEntitlement,
] as const;
