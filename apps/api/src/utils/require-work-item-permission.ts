import type { WorkItemAction } from "@kaneo/permissions";
import { inArray } from "drizzle-orm";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";
import { requireWorkspacePermission } from "./require-workspace-permission";
import type { PermissionMap } from "./role-permissions";
import { mergePermissions, workItemPermissions } from "./work-item-permissions";

// Checks `action` on the type of the task row(s) the workspace access
// middleware resolved (`fromTask`, `fromTasks`, `fromComment`, ...), plus any
// `extra` permissions.
export function requireWorkItemPermission(
  action: WorkItemAction,
  extra?: PermissionMap,
) {
  return async (c: Context, next: Next) => {
    const types = c.get("taskTypes") as string[] | undefined;
    if (!types?.length) {
      throw new HTTPException(400, {
        message: "Task could not be determined",
      });
    }
    return requireWorkspacePermission(
      mergePermissions(workItemPermissions(types, action), extra),
    )(c, next);
  };
}

// Types of the given task rows. Unknown ids are ignored: the handler rejects
// them, and `workItemPermissions` falls back to `task` for an empty list.
export async function workItemTypesOf(ids: readonly string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await db
    .selectDistinct({ type: schema.taskTable.type })
    .from(schema.taskTable)
    .where(inArray(schema.taskTable.id, unique));
  return rows.map((row) => row.type);
}

export function stringIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string")
    : [];
}

// For rows named in the request body rather than the path, e.g. tasks linked
// into a milestone or reordered on a board.
export async function workItemPermissionsForIds(
  ids: readonly string[],
  action: WorkItemAction,
): Promise<PermissionMap> {
  if (ids.length === 0) return {};
  return workItemPermissions(await workItemTypesOf(ids), action);
}
