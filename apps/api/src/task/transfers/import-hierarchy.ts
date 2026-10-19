import { createId } from "@paralleldrive/cuid2";
import { eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  columnTable,
  milestoneTable,
  projectTable,
  taskTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import { writeImportLabels } from "../../import/writer/write-import-labels";
import { filterUsersWithProjectAccess } from "../../project-access/filter-users-with-project-access";
import {
  filterAssignableUsers,
  NO_PROJECT_ACCESS,
  NOT_ASSIGNABLE,
} from "../../utils/assert-assignable-user";
import { claimTaskNumber } from "../controllers/claim-task-numbers";
import { nextTaskPosition } from "../controllers/next-task-position";
import type { ImportTask } from "../controllers/import-tasks";
import {
  coercePriority,
  coerceStatus,
  getValidTaskStatuses,
} from "../validate-task-fields";
import { planTransferHierarchy, type TransferMilestone } from "./hierarchy";

export type HierarchyTransferTask = ImportTask & {
  key?: string;
  featureKey?: string | null;
  milestoneKey?: string | null;
  labels?: Array<{ name: string; color: string }>;
};

export type HierarchyTransfer = {
  tasks: HierarchyTransferTask[];
  milestones?: TransferMilestone[];
};

export async function importHierarchy(
  projectId: string,
  document: HierarchyTransfer,
  currentUserId?: string,
  expectedWorkspaceId?: string,
) {
  const hierarchy = planTransferHierarchy(
    document.tasks.map((task) => ({ ...task, key: task.key ?? "" })),
    document.milestones ?? [],
  );
  const project = await db.query.projectTable.findFirst({
    where: eq(projectTable.id, projectId),
  });
  if (!project) throw new HTTPException(404, { message: "Project not found" });
  const ids = [
    ...new Set(
      document.tasks
        .map((task) => task.userId?.trim())
        .filter((id): id is string => !!id),
    ),
  ];
  const members = await filterAssignableUsers(ids, project.workspaceId);
  const permitted = await filterUsersWithProjectAccess(members, projectId);
  for (const id of ids) {
    if (!permitted.has(id))
      throw new HTTPException(400, {
        message: members.has(id) ? NO_PROJECT_ACCESS : NOT_ASSIGNABLE,
      });
  }
  const statuses = await getValidTaskStatuses(projectId);
  const columns = await db
    .select()
    .from(columnTable)
    .where(eq(columnTable.projectId, projectId));
  const columnIds = new Map(columns.map((column) => [column.slug, column.id]));
  const prepared = document.tasks.map((item) => {
    const status = coerceStatus(item.status, statuses);
    const priority = coercePriority(item.priority ?? "low");
    for (const value of [item.startDate, item.dueDate]) {
      if (value && Number.isNaN(Date.parse(value)))
        throw new HTTPException(400, { message: "Invalid task date" });
    }
    if (!item.title.trim())
      throw new HTTPException(400, { message: "Task title is required" });
    return {
      item,
      id: createId(),
      status: status.status,
      priority: priority.priority,
      warnings: [status.warning, priority.warning].filter(
        (warning): warning is string => !!warning,
      ),
    };
  });
  const taskIds = new Map(prepared.map(({ item, id }) => [item.key!, id]));
  const created = await db.transaction(async (tx) => {
    const [lockedProject] = await tx
      .select({ workspaceId: projectTable.workspaceId })
      .from(projectTable)
      .where(eq(projectTable.id, projectId))
      .for("update");
    if (
      !lockedProject ||
      lockedProject.workspaceId !== (expectedWorkspaceId ?? project.workspaceId)
    ) {
      throw new HTTPException(409, {
        message: "Project moved; reload before importing",
      });
    }
    const rows = [];
    for (const { item, id, status, priority, warnings } of prepared) {
      const number = await claimTaskNumber(projectId, tx);
      const columnId = columnIds.get(status) ?? null;
      const position = await nextTaskPosition(tx, projectId, status, columnId);
      const [row] = await tx
        .insert(taskTable)
        .values({
          id,
          projectId,
          number,
          position,
          title: item.title.trim(),
          type: item.type ?? "task",
          description: item.description ?? "",
          status,
          columnId,
          priority,
          startDate: item.startDate ? new Date(item.startDate) : null,
          dueDate: item.dueDate ? new Date(item.dueDate) : null,
          userId: item.userId?.trim() || null,
        })
        .returning();
      rows.push({
        success: true as const,
        task: row!,
        ...(warnings.length ? { warnings } : {}),
      });
    }
    for (const [key, owner] of hierarchy.memberships) {
      await tx
        .update(taskTable)
        .set({ featureId: taskIds.get(owner)! })
        .where(eq(taskTable.id, taskIds.get(key)!));
    }
    const milestoneIds = new Map<string, string>();
    for (const milestone of hierarchy.milestones) {
      const id = createId();
      await tx.insert(milestoneTable).values({
        id,
        featureId: taskIds.get(milestone.featureKey)!,
        title: milestone.title,
        description: milestone.description ?? null,
        startDate: milestone.startDate ?? null,
        endDate: milestone.endDate ?? null,
        position: milestone.position,
      });
      milestoneIds.set(milestone.key, id);
    }
    for (const [key, milestoneKey] of hierarchy.links) {
      await tx
        .update(taskTable)
        .set({ milestoneId: milestoneIds.get(milestoneKey)! })
        .where(eq(taskTable.id, taskIds.get(key)!));
    }
    const labels = new Map(
      prepared.flatMap(({ item }) =>
        (item.labels ?? []).map(
          (label) => [label.name, { key: label.name, ...label }] as const,
        ),
      ),
    );
    await writeImportLabels(
      tx,
      project.workspaceId,
      [...labels.values()],
      prepared.map(({ item, id }) => ({
        id,
        labelKeys: (item.labels ?? []).map((label) => label.name),
      })),
    );
    // Return the actual linked rows, not the intermediate inserts.
    const linked = await tx
      .select()
      .from(taskTable)
      .where(inArray(taskTable.id, [...taskIds.values()]));
    const byId = new Map(linked.map((task) => [task.id, task]));
    return rows.map((result) => ({
      ...result,
      task: byId.get(result.task.id)!,
    }));
  });
  await publishEvent("task-relation.refresh", {
    projectId,
    userId: currentUserId,
  });
  for (const result of created) {
    await publishEvent("task.created", {
      ...result.task,
      taskId: result.task.id,
      userId: result.task.userId ?? "",
      currentUserId: currentUserId ?? "",
      type: "create",
      content: "imported the task",
    });
  }
  return {
    importedAt: new Date().toISOString(),
    project: { id: project.id, name: project.name, slug: project.slug },
    results: {
      total: created.length,
      successful: created.length,
      failed: 0,
      tasks: created,
    },
  };
}
