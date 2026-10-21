import {
  assertReadonlyMilestoneStatus,
  moveMilestoneFollowers,
  recordMilestoneActivity,
  resolveMilestonePlanning,
  type MilestonePlanningFields,
} from "./planning";
import { linkSelectedMilestoneTasks } from "./link-selected-tasks";
import { assertReadonlyMilestoneDates } from "./dates";
import { lockAuthorizedProject } from "./access-scope";
import { asc, eq, sql } from "drizzle-orm";
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
) {
  await lockAuthorizedProject(tx, expectedProjectId, expectedWorkspaceId);
  const [feature] = await tx
    .select()
    .from(taskTable)
    .where(eq(taskTable.id, featureId))
    .for("update");
  if (!feature) throw new HTTPException(404, { message: "Feature not found" });
  if (expectedProjectId && feature.projectId !== expectedProjectId)
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
  fields: Fields & { taskIds?: string[] },
  userId: string,
  expectedProjectId?: string,
  expectedWorkspaceId?: string,
  timeZone = "UTC",
) {
  assertReadonlyMilestoneDates(fields);
  assertReadonlyMilestoneStatus(fields);
  const { taskIds = [], ...metadata } = fields;
  if (new Set(taskIds).size !== taskIds.length)
    throw new HTTPException(400, { message: "Task ids must be unique" });
  const result = await retryTransaction(() =>
    db.transaction(async (tx) => {
      const feature = await lockOwner(
        tx,
        featureId,
        expectedProjectId,
        expectedWorkspaceId,
      );
      const planning = await resolveMilestonePlanning(
        tx,
        feature.projectId,
        metadata,
      );
      const [last] = await tx
        .select({
          position: sql<number>`coalesce(max(${milestoneTable.position}), -1)`,
        })
        .from(milestoneTable)
        .where(eq(milestoneTable.featureId, featureId));
      const [created] = await tx
        .insert(milestoneTable)
        .values({
          featureId,
          ...metadata,
          ...planning,
          position: Number(last?.position ?? -1) + 1,
        })
        .returning();
      if (!created)
        throw new HTTPException(500, { message: "Failed to create milestone" });
      await recordMilestoneActivity(
        tx,
        featureId,
        created,
        "milestone_created",
        userId,
      );
      const linked = await linkSelectedMilestoneTasks(
        tx,
        created.id,
        feature,
        taskIds,
        userId,
      );
      return {
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
  await publishMilestoneChange(
    result.projectId,
    featureId,
    result.milestone.id,
    userId,
  );
  for (const id of result.previousMilestoneIds)
    await publishMilestoneChange(result.projectId, featureId, id, userId);
  if (result.taskIds.length) {
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
      const planning = await resolveMilestonePlanning(
        tx,
        feature.projectId,
        fields,
      );
      const movedTaskIds =
        fields.releaseId !== undefined && fields.releaseId !== current.releaseId
          ? await moveMilestoneFollowers(
              tx,
              current,
              feature.projectId,
              fields.releaseId,
              userId,
            )
          : [];
      const [updated] = await tx
        .update(milestoneTable)
        .set({ ...fields, ...planning })
        .where(eq(milestoneTable.id, id))
        .returning();
      if (!updated)
        throw new HTTPException(404, { message: "Milestone not found" });
      await recordMilestoneActivity(
        tx,
        featureId,
        updated,
        "milestone_updated",
        userId,
        Object.fromEntries(
          Object.entries(fields).map(([key, value]) => [
            key,
            { from: current[key as keyof typeof current], to: value },
          ]),
        ),
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
