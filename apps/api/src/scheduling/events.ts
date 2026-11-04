import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import db from "../database";
import { projectTable, taskRelationTable, taskTable } from "../database/schema";
import { subscribeToEvent } from "../events";
import { broadcastToProject } from "../ws";

type PlanningEvent = {
  projectId?: string;
  taskId?: string;
  targetTaskId?: string;
  toProjectId?: string;
  fromProjectId?: string;
  workspaceId?: string;
  projectIds?: string[];
  published?: boolean;
};
const queued = new Map<string, { published: boolean; deleted: boolean }>();
let timer: ReturnType<typeof setTimeout> | null = null;
async function refresh(
  projectId: string,
  published: boolean,
  deleted: boolean,
) {
  const source = alias(taskTable, "schedule_source");
  const target = alias(taskTable, "schedule_target");
  const projects = new Set([projectId]);
  if (deleted) {
    // Cascade deletion has removed its edges. Reconcile workspace plans so a
    // removed cross-project blocker cannot leave a stale preview applyable.
    const [owner] = await db
      .select({ workspaceId: projectTable.workspaceId })
      .from(projectTable)
      .where(eq(projectTable.id, projectId));
    if (owner)
      for (const row of await db
        .select({ id: projectTable.id })
        .from(projectTable)
        .where(eq(projectTable.workspaceId, owner.workspaceId)))
        projects.add(row.id);
  } else {
    const rows = await db
      .selectDistinct({ projectId: target.projectId })
      .from(taskRelationTable)
      .innerJoin(source, eq(source.id, taskRelationTable.sourceTaskId))
      .innerJoin(target, eq(target.id, taskRelationTable.targetTaskId))
      .where(eq(source.projectId, projectId));
    for (const row of rows) projects.add(row.projectId);
  }
  // Include the initiating window: ordinary task mutation callbacks do not
  // own the independent project plan query.
  for (const id of projects)
    broadcastToProject(id, {
      type: "SCHEDULE_UPDATED",
      projectId: id,
      schedulePublished: published && id === projectId,
    });
}
async function queue(data: PlanningEvent, deleted = false) {
  let projectId = data.projectId;
  if (!projectId && data.taskId) {
    const [task] = await db
      .select({ projectId: taskTable.projectId })
      .from(taskTable)
      .where(eq(taskTable.id, data.taskId));
    projectId = task?.projectId;
  }
  const additional = [...(data.projectIds ?? [])];
  if (data.workspaceId && !data.projectIds) {
    for (const row of await db
      .select({ id: projectTable.id })
      .from(projectTable)
      .where(eq(projectTable.workspaceId, data.workspaceId)))
      additional.push(row.id);
  }
  if (data.targetTaskId) {
    const [target] = await db
      .select({ projectId: taskTable.projectId })
      .from(taskTable)
      .where(eq(taskTable.id, data.targetTaskId));
    if (target) additional.push(target.projectId);
  }
  for (const id of new Set(
    [projectId, data.toProjectId, data.fromProjectId, ...additional].filter(
      (id): id is string => Boolean(id),
    ),
  )) {
    const prior = queued.get(id);
    queued.set(id, {
      published: Boolean(prior?.published || data.published),
      deleted: Boolean(prior?.deleted || deleted),
    });
  }
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const pending = [...queued];
    queued.clear();
    for (const [id, flags] of pending)
      void refresh(id, flags.published, flags.deleted).catch((error) =>
        console.error("Could not reconcile project scheduling", error),
      );
  }, 150);
}
for (const name of [
  "task.created",
  "task.updated",
  "task.status_changed",
  "task.priority_changed",
  "task.assignee_changed",
  "task.unassigned",
  "task.bulk_unassigned",
  "task.moved",
  "tasks.reordered",
  "task-relation.created",
  "task-relation.deleted",
  "task-relation.refresh",
  "release.changed",
  "milestone.changed",
  "project.updated",
  "project_access.updated",
  "project_members.updated",
  "project-schedule.changed",
  "time-entry.created",
  "time-entry.updated",
  "time-entry.deleted",
])
  void subscribeToEvent<PlanningEvent>(name, (data) => queue(data));
void subscribeToEvent<PlanningEvent>("task.deleted", (data) =>
  queue(data, true),
);
