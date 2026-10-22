import { createMilestoneTasks } from "./create-milestone-tasks";
import { createMilestoneInTransaction } from "./create-milestone-in-transaction";
import { lockTaskCreationProject } from "../task/controllers/create-task-in-transaction";
import { milestoneTaskDraftsSchema, type MilestoneTaskDraft } from "./schema";
import {
  assertReadonlyMilestoneStatus,
  recordMilestoneActivity,
  type MilestonePlanningFields,
} from "./planning";
import { updateMilestoneInTransaction } from "./update-milestone-in-transaction";
import { linkSelectedMilestoneTasks } from "./link-selected-tasks";
import { assertReadonlyMilestoneDates } from "./dates";
import { lockAuthorizedProject } from "./access-scope";
import { asc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { milestoneTable, taskTable } from "../database/schema";
import { publishEvent } from "../events";
import { retryTransaction } from "../utils/retry-transaction";
import { recordMilestoneChange, type MilestoneTransaction } from "./membership";
import { readMilestone, readMilestones } from "./read-milestones";

type Fields = MilestonePlanningFields & {
  title: string;
  description?: string | null;
};
async function lockOwner(
  tx: MilestoneTransaction,
  featureId: string,
  expectedProjectId?: string,
  expectedWorkspaceId?: string,
  createsTasks = false,
) {
  let projectId = expectedProjectId;
  if (createsTasks) {
    const [owner] = await tx
      .select({ projectId: taskTable.projectId })
      .from(taskTable)
      .where(eq(taskTable.id, featureId));
    if (!owner) throw new HTTPException(404, { message: "Feature not found" });
    if (expectedProjectId && owner.projectId !== expectedProjectId)
      throw new HTTPException(409, {
        message: "Feature changed projects; retry the request",
      });
    projectId = owner.projectId;
    await lockTaskCreationProject(tx, owner.projectId, expectedWorkspaceId);
  }
  await lockAuthorizedProject(tx, expectedProjectId, expectedWorkspaceId);
  const [feature] = await tx
    .select()
    .from(taskTable)
    .where(eq(taskTable.id, featureId))
    .for("update");
  if (!feature) throw new HTTPException(404, { message: "Feature not found" });
  if (projectId && feature.projectId !== projectId)
    throw new HTTPException(409, {
      message: "Feature changed projects; retry the request",
    });
  if (feature.type !== "feature")
    throw new HTTPException(409, { message: "That task isn't a feature" });
  return feature;
}
async function ownerId(tx: MilestoneTransaction, id: string) {
  const [row] = await tx
    .select({ featureId: milestoneTable.featureId })
    .from(milestoneTable)
    .where(eq(milestoneTable.id, id));
  if (!row) throw new HTTPException(404, { message: "Milestone not found" });
  return row.featureId;
}
export async function publishMilestoneChange(
  projectId: string,
  featureId: string,
  milestoneId: string | null,
  userId: string,
) {
  await publishEvent("milestone.changed", {
    projectId,
    featureId,
    milestoneId,
    userId,
  });
}
export async function createMilestone(
  featureId: string,
  fields: Fields & { taskIds?: string[]; newTasks?: MilestoneTaskDraft[] },
  userId: string,
  expectedProjectId?: string,
  expectedWorkspaceId?: string,
  timeZone = "UTC",
) {
  assertReadonlyMilestoneDates(fields);
  assertReadonlyMilestoneStatus(fields);
  const { taskIds = [], newTasks: inputDrafts = [], ...metadata } = fields;
  const drafts = milestoneTaskDraftsSchema.safeParse(inputDrafts);
  if (!drafts.success)
    throw new HTTPException(400, {
      message:
        "New work must contain at most 100 Tasks/Bugs with nonempty titles",
    });
  if (new Set(taskIds).size !== taskIds.length)
    throw new HTTPException(400, { message: "Task ids must be unique" });
  const result = await retryTransaction(() =>
    db.transaction(async (tx) => {
      const feature = await lockOwner(
        tx,
        featureId,
        expectedProjectId,
        expectedWorkspaceId,
        drafts.data.length > 0,
      );
      const created = await createMilestoneInTransaction(
        tx,
        feature,
        metadata,
        userId,
      );
      const linked = await linkSelectedMilestoneTasks(
        tx,
        created.id,
        feature,
        taskIds,
        userId,
      );
      const createdTasks = await createMilestoneTasks(
        tx,
        feature,
        created,
        drafts.data,
        userId,
        expectedWorkspaceId,
      );
      return {
        createdTasks,
        milestone: await readMilestone(
          created.id,
          tx,
          undefined,
          undefined,
          timeZone,
        ),
        projectId: feature.projectId,
        ...linked,
      };
    }),
  );
  for (const task of result.createdTasks) {
    await publishEvent("task.created", {
      ...task,
      taskId: task.id,
      userId: task.userId ?? "",
      currentUserId: userId,
      type: "created",
      content: null,
    });
  }
  await publishMilestoneChange(
    result.projectId,
    featureId,
    result.milestone.id,
    userId,
  );
  for (const id of result.previousMilestoneIds)
    await publishMilestoneChange(result.projectId, featureId, id, userId);
  if (result.taskIds.length || result.createdTasks.length) {
    for (const taskId of [...result.taskIds, featureId]) {
      await publishEvent("task.updated", {
        taskId,
        projectId: result.projectId,
        userId,
      });
    }
  }
  return result.milestone;
}
export async function updateMilestone(
  id: string,
  fields: Partial<Fields>,
  userId: string,
  expectedProjectId?: string,
  expectedWorkspaceId?: string,
  timeZone = "UTC",
) {
  assertReadonlyMilestoneDates(fields);
  assertReadonlyMilestoneStatus(fields);
  const result = await retryTransaction(() =>
    db.transaction(async (tx) => {
      const featureId = await ownerId(tx, id);
      const feature = await lockOwner(
        tx,
        featureId,
        expectedProjectId,
        expectedWorkspaceId,
      );
      const [current] = await tx
        .select()
        .from(milestoneTable)
        .where(eq(milestoneTable.id, id))
        .for("update");
      if (!current)
        throw new HTTPException(404, { message: "Milestone not found" });
      const { movedTaskIds } = await updateMilestoneInTransaction(
        tx,
        current,
        feature.projectId,
        fields,
        userId,
      );
      return {
        movedTaskIds,
        milestone: await readMilestone(id, tx, undefined, undefined, timeZone),
        projectId: feature.projectId,
      };
    }),
  );
  await publishMilestoneChange(
    result.projectId,
    result.milestone.featureId,
    id,
    userId,
  );
  for (const taskId of result.movedTaskIds)
    await publishEvent("task.updated", {
      taskId,
      projectId: result.projectId,
      userId,
    });
  await publishEvent("release.changed", { projectId: result.projectId });
  return result.milestone;
}
export async function deleteMilestone(
  id: string,
  userId: string,
  expectedProjectId?: string,
  expectedWorkspaceId?: string,
) {
  const result = await retryTransaction(() =>
    db.transaction(async (tx) => {
      const featureId = await ownerId(tx, id);
      const feature = await lockOwner(
        tx,
        featureId,
        expectedProjectId,
        expectedWorkspaceId,
      );
      const members = await tx
        .select({ id: taskTable.id })
        .from(taskTable)
        .where(eq(taskTable.milestoneId, id))
        .orderBy(asc(taskTable.id))
        .for("update");
      await recordMilestoneChange(tx, {
        taskIds: members.map((task) => task.id),
        projectId: feature.projectId,
        from: id,
        to: null,
        userId,
      });
      await tx
        .update(taskTable)
        .set({ milestoneId: null })
        .where(eq(taskTable.milestoneId, id));
      const [deleted] = await tx
        .delete(milestoneTable)
        .where(eq(milestoneTable.id, id))
        .returning();
      if (!deleted)
        throw new HTTPException(404, { message: "Milestone not found" });
      await recordMilestoneActivity(
        tx,
        featureId,
        deleted,
        "milestone_deleted",
        userId,
      );
      return { projectId: feature.projectId, featureId };
    }),
  );
  await publishMilestoneChange(result.projectId, result.featureId, id, userId);
  await publishEvent("task-relation.refresh", {
    projectId: result.projectId,
    userId,
  });
  return { id };
}
export async function reorderMilestones(
  featureId: string,
  milestoneIds: string[],
  userId: string,
  expectedProjectId?: string,
  expectedWorkspaceId?: string,
  timeZone = "UTC",
) {
  if (new Set(milestoneIds).size !== milestoneIds.length)
    throw new HTTPException(400, { message: "Milestone ids must be unique" });
  const result = await retryTransaction(() =>
    db.transaction(async (tx) => {
      const feature = await lockOwner(
        tx,
        featureId,
        expectedProjectId,
        expectedWorkspaceId,
      );
      const existing = await tx
        .select({ id: milestoneTable.id })
        .from(milestoneTable)
        .where(eq(milestoneTable.featureId, featureId));
      const expected = new Set(existing.map((row) => row.id));
      if (
        existing.length !== milestoneIds.length ||
        milestoneIds.some((id) => !expected.has(id))
      )
        throw new HTTPException(409, {
          message: "Milestones changed; reload before reordering",
        });
      for (const [position, id] of milestoneIds.entries())
        await tx
          .update(milestoneTable)
          .set({ position })
          .where(eq(milestoneTable.id, id));
      return {
        milestones: await readMilestones(
          featureId,
          tx,
          undefined,
          undefined,
          timeZone,
        ),
        projectId: feature.projectId,
      };
    }),
  );
  await publishMilestoneChange(result.projectId, featureId, null, userId);
  return result.milestones;
}
