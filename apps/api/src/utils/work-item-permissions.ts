import { isWorkItemType, type WorkItemAction } from "@kaneo/permissions";
import type { PermissionMap } from "./role-permissions";

// A task row's type is its permission resource: acting on a bug needs
// `bug:<action>`, on a feature `feature:<action>`. An empty list falls back to
// `task`, so a check never passes just because no rows were found.
export function workItemPermissions(
  types: readonly string[],
  action: WorkItemAction,
): PermissionMap {
  const out: PermissionMap = {};
  for (const type of types.length > 0 ? types : ["task"]) {
    if (!isWorkItemType(type)) {
      throw new Error(`Unknown task type: ${type}`);
    }
    out[type] = [action];
  }
  return out;
}

export function mergePermissions(
  ...maps: (PermissionMap | undefined)[]
): PermissionMap {
  const out: PermissionMap = {};
  for (const map of maps) {
    for (const [resource, actions] of Object.entries(map ?? {})) {
      out[resource] = [...new Set([...(out[resource] ?? []), ...actions])];
    }
  }
  return out;
}
