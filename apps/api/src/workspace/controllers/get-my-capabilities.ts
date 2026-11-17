import {
  WORKSPACE_CAPABILITY_NAMES,
  type WorkspaceCapability,
  workspaceCapabilities,
} from "@kaneo/permissions";
import type { PermissionMap } from "../../utils/role-permissions";

// Time off belongs to members: an instance admin outside the workspace sees
// the calendar but can't request or approve (see time-off/viewer.ts).
const MEMBER_ONLY: readonly WorkspaceCapability[] = [
  "requestTimeOff",
  "approveTimeOff",
];

function getMyCapabilities(
  allows: (permissions: PermissionMap) => boolean,
  isMember: boolean,
): Record<WorkspaceCapability, boolean> {
  const result = {} as Record<WorkspaceCapability, boolean>;
  for (const name of WORKSPACE_CAPABILITY_NAMES) {
    const permissions: PermissionMap = {};
    for (const [resource, actions] of Object.entries(
      workspaceCapabilities[name],
    )) {
      permissions[resource] = [...actions];
    }
    result[name] =
      (isMember || !MEMBER_ONLY.includes(name)) && allows(permissions);
  }
  return result;
}

export default getMyCapabilities;
