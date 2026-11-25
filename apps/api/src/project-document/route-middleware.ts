import { requireEntitlement } from "../billing/require-entitlement-middleware";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";

// Project pages have their own `document` permissions; the Feature documents
// listed beside them follow `feature`.
export const projectRead = [
  workspaceAccess.fromProject("projectId"),
  requireWorkspacePermission({ document: ["read"] }),
] as const;
export const projectCreate = [
  workspaceAccess.fromProject("projectId"),
  requireWorkspacePermission({ document: ["create"] }),
  requireEntitlement,
] as const;
// Uploads are staged before the save that claims them.
export const projectUpload = [
  workspaceAccess.fromProject("projectId"),
  requireWorkspacePermission({ document: ["update"] }),
  requireEntitlement,
] as const;
export const read = [
  workspaceAccess.fromProjectDocument("id"),
  requireWorkspacePermission({ document: ["read"] }),
] as const;
export const write = [
  workspaceAccess.fromProjectDocument("id"),
  requireWorkspacePermission({ document: ["update"] }),
  requireEntitlement,
] as const;
export const remove = [
  workspaceAccess.fromProjectDocument("id"),
  requireWorkspacePermission({ document: ["delete"] }),
  requireEntitlement,
] as const;
