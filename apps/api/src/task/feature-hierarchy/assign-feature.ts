import { recordMilestoneChange } from "../../milestone/membership";
import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type db from "../../database";
import { activityTable, taskTable } from "../../database/schema";
import { recordReleaseChange } from "../../release/membership/record-release-change";
import { recordFeatureChange } from "./record-feature-change";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Task = typeof taskTable.$inferSelect;
export type TaskType = Task["type"];

// The database only knows a feature link points at some task. Every write
// that sets one goes through here, which checks the rest under row locks:
// the target is a feature (locked FOR SHARE, so it can't turn back into a
// task meanwhile) in the same project, and the task joining it is a task.
// A task outside the project reads as missing, so its type stays private.
// The lock keeps milestone ownership stable during membership changes.
export async function lockFeature(
  tx: Tx,
  featureId: string,
  projectId: string,
) {
  const [feature] = await tx
    .select({
      id: taskTable.id,
      type: taskTable.type,
      releaseId: taskTable.releaseId,
    })
    .from(taskTable)
    .where(and(eq(taskTable.id, featureId), eq(taskTable.projectId, projectId)))
    .for("share");
  if (!feature) {
    throw new HTTPException(404, { message: "Feature not found" });
  }
  if (feature.type !== "feature") {
    throw new HTTPException(409, { message: "That task isn't a feature" });
  }
  return feature;
}

// Puts a task (locked FOR UPDATE by the caller) into a feature, or takes it
// out with null. Changing Feature clears its milestone and preserves its
// release. Returns the updated row; a no-op
// returns the task as is.
export async function setTaskFeature(
  tx: Tx,
  task: Task,
  featureId: string | null,
  userId?: string,
) {
  if (featureId === task.featureId) return task;
  const releaseId = task.releaseId;
  if (featureId) {
    if (task.type === "feature")
      throw new HTTPException(409, {
        message: "A feature cannot belong to another feature",
      });
    await lockFeature(tx, featureId, task.projectId);
  }
  const [updated] = await tx
    .update(taskTable)
    .set({ featureId, releaseId, milestoneId: null })
    .where(eq(taskTable.id, task.id))
    .returning();
  if (!updated) {
    throw new HTTPException(500, { message: "Failed to update the feature" });
  }
  await recordMilestoneChange(tx, {
    taskIds: [task.id],
    projectId: task.projectId,
    from: task.milestoneId,
    to: null,
    userId,
  });
  await recordFeatureChange(tx, {
    taskIds: [task.id],
    projectId: task.projectId,
    from: task.featureId,
    to: featureId,
    userId,
  });
  await recordReleaseChange(tx, {
    taskIds: [task.id],
    projectId: task.projectId,
    from: task.releaseId,
    to: releaseId,
    userId,
  });
  return updated;
}

// Task/Bug type changes preserve membership; Features keep their identity.
export async function setTaskType(
  tx: Tx,
  task: Task,
  type: TaskType,
  userId?: string,
) {
  if (type === task.type) return task;
  if (task.type === "feature" || type === "feature")
    throw new HTTPException(409, {
      message: "Features cannot be converted to or from Tasks or Bugs",
    });
  const [updated] = await tx
    .update(taskTable)
    .set({
      type,
      featureId: task.featureId,
      milestoneId: task.milestoneId,
    })
    .where(and(eq(taskTable.id, task.id), eq(taskTable.type, task.type)))
    .returning();
  if (!updated) {
    throw new HTTPException(500, { message: "Failed to update the task type" });
  }
  await tx.insert(activityTable).values({
    taskId: task.id,
    type: "type_changed",
    userId: userId ?? null,
    content: null,
    eventData: { oldType: task.type, newType: type },
  });
  return updated;
}
