import {
  isWorkItemType,
  WORK_ITEM_TYPES,
  type WorkItemType,
} from "@kaneo/permissions";
import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireEntitlement } from "../../billing/require-entitlement-middleware";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { readJsonObjectBody } from "../../utils/read-json-object-body";
import {
  requireWorkItemPermission,
  stringIds,
  workItemPermissionsForIds,
} from "../../utils/require-work-item-permission";
import {
  requireAnyWorkspacePermission,
  requireWorkspacePermission,
} from "../../utils/require-workspace-permission";
import {
  mergePermissions,
  workItemPermissions,
} from "../../utils/work-item-permissions";

type BulkTaskOperation =
  | "updateStatus"
  | "updatePriority"
  | "updateAssignee"
  | "delete"
  | "addLabel"
  | "removeLabel"
  | "updateEstimate"
  | "updateDueDate";

const BULK_OPERATIONS: readonly BulkTaskOperation[] = [
  "updateStatus",
  "updatePriority",
  "updateAssignee",
  "delete",
  "addLabel",
  "removeLabel",
  "updateEstimate",
  "updateDueDate",
];

async function bulkOperation(c: Context): Promise<BulkTaskOperation> {
  const { operation } = await readJsonObjectBody(c);
  if (
    typeof operation !== "string" ||
    !(BULK_OPERATIONS as readonly string[]).includes(operation)
  ) {
    throw new HTTPException(400, {
      message: `operation must be one of: ${BULK_OPERATIONS.join(", ")}`,
    });
  }
  return operation as BulkTaskOperation;
}

export async function requireBulkTaskPermission(c: Context, next: Next) {
  const operation = await bulkOperation(c);

  if (operation === "delete") {
    return requireWorkItemPermission("delete")(c, next);
  }

  if (operation === "updateAssignee") {
    return requireWorkspacePermission({ task: ["assign"] })(c, next);
  }

  if (operation === "addLabel" || operation === "removeLabel") {
    return requireWorkspacePermission({ label: ["update"] })(c, next);
  }

  return requireWorkItemPermission("update")(c, next);
}

export async function requireBulkTaskEntitlement(c: Context, next: Next) {
  const operation = await bulkOperation(c);

  if (
    operation === "delete" ||
    operation === "addLabel" ||
    operation === "removeLabel"
  ) {
    return next();
  }

  return requireEntitlement(c, next);
}

export async function requireTaskAssigneePermission(c: Context, next: Next) {
  const id = c.req.param("id");
  const { userId } = await readJsonObjectBody(c);
  // Mirror the controller: a blank userId means "unassigned", so an
  // unassigned task saved with `userId: ""` keeps its (null) assignee and
  // must not require task:assign.
  const nextAssignee =
    typeof userId === "string" && userId.trim() ? userId.trim() : null;

  const [existingTask] = await db
    .select({ userId: taskTable.userId })
    .from(taskTable)
    .where(eq(taskTable.id, id ?? ""))
    .limit(1);

  if (existingTask && existingTask.userId !== nextAssignee) {
    return requireWorkspacePermission({ task: ["assign"] })(c, next);
  }

  return next();
}

// The validators run after middleware, so an invalid type is checked as a task
// here and rejected by the validator afterwards.
function bodyWorkItemType(value: unknown): WorkItemType {
  return isWorkItemType(value) ? value : "task";
}

// Title-only drafts created along with a milestone or feature.
export function draftWorkItemTypes(drafts: unknown): WorkItemType[] {
  if (!Array.isArray(drafts)) return [];
  return drafts.map((draft) =>
    bodyWorkItemType(
      draft && typeof draft === "object"
        ? (draft as { type?: unknown }).type
        : undefined,
    ),
  );
}

// Uploads staged before a task, bug or feature exists.
export const requireAnyWorkItemCreatePermission = requireAnyWorkspacePermission(
  WORK_ITEM_TYPES.map((type) => ({ [type]: ["create"] })),
);

// An export carries every kind of work and the milestones.
export const requireTaskExportPermission = requireWorkspacePermission({
  task: ["read"],
  bug: ["read"],
  feature: ["read"],
  milestone: ["read"],
});

export async function requireTaskCreatePermission(c: Context, next: Next) {
  const { type } = await readJsonObjectBody(c);
  return requireWorkspacePermission(
    workItemPermissions([bodyWorkItemType(type)], "create"),
  )(c, next);
}

export async function requireTaskImportPermission(c: Context, next: Next) {
  const { tasks } = await readJsonObjectBody(c);
  return requireWorkspacePermission(
    workItemPermissions(draftWorkItemTypes(tasks), "create"),
  )(c, next);
}

// Changing a task into a bug edits the task and creates a bug.
export async function requireTaskTypeChangePermission(c: Context, next: Next) {
  const { type } = await readJsonObjectBody(c);
  return requireWorkItemPermission(
    "update",
    workItemPermissions([bodyWorkItemType(type)], "create"),
  )(c, next);
}

export async function requireReorderTaskPermission(c: Context, next: Next) {
  const { tasks } = await readJsonObjectBody(c);
  const ids = Array.isArray(tasks)
    ? stringIds(
        tasks.map((task) =>
          task && typeof task === "object"
            ? (task as { id?: unknown }).id
            : undefined,
        ),
      )
    : [];
  return requireWorkspacePermission(
    ids.length > 0
      ? await workItemPermissionsForIds(ids, "update")
      : { task: ["update"] },
  )(c, next);
}

export async function requireFeatureCompositionPermission(
  c: Context,
  next: Next,
) {
  const { featureComposition } = await readJsonObjectBody(c);
  if (
    !featureComposition ||
    typeof featureComposition !== "object" ||
    Array.isArray(featureComposition)
  )
    return next();
  const { milestones, existingTasks, newTasks } = featureComposition as {
    milestones?: unknown;
    existingTasks?: unknown;
    newTasks?: unknown;
  };
  const hasMilestones = Array.isArray(milestones) && milestones.length > 0;
  const assignsLead =
    Array.isArray(milestones) &&
    milestones.some(
      (milestone) =>
        milestone &&
        typeof milestone === "object" &&
        typeof milestone.leadId === "string" &&
        milestone.leadId.length > 0,
    );
  const linkedIds = Array.isArray(existingTasks)
    ? stringIds(
        existingTasks.map((task) =>
          task && typeof task === "object"
            ? (task as { id?: unknown }).id
            : undefined,
        ),
      )
    : [];
  const drafts = draftWorkItemTypes(newTasks);
  const required = mergePermissions(
    hasMilestones ? { milestone: ["create"] } : undefined,
    assignsLead ? { task: ["assign"] } : undefined,
    await workItemPermissionsForIds(linkedIds, "update"),
    drafts.length > 0 ? workItemPermissions(drafts, "create") : undefined,
  );
  if (Object.keys(required).length === 0) return next();
  return requireWorkspacePermission(required)(c, next);
}
