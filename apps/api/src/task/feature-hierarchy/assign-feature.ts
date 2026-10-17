import { and, count, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type db from "../../database";
import { activityTable, taskTable } from "../../database/schema";
import { recordFeatureChange } from "./record-feature-change";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Task = typeof taskTable.$inferSelect;
export type TaskType = Task["type"];

// The database only knows a feature link points at some task. Every write
// that sets one goes through here, which checks the rest under row locks:
// the target is a feature (locked FOR SHARE, so it can't turn back into a
// task meanwhile) in the same project, and the task joining it is a task.
// A task outside the project reads as missing, so its type stays private.
export async function lockFeature(
  tx: Tx,
  featureId: string,
  projectId: string,
) {
  const [feature] = await tx
    .select({ id: taskTable.id, type: taskTable.type })
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
// out with null. Returns the updated row; a no-op returns the task as is.
export async function setTaskFeature(
  tx: Tx,
  task: Task,
  featureId: string | null,
  userId?: string,
) {
  if (featureId === task.featureId) return task;
  if (featureId) {
    if (task.type === "feature") {
      throw new HTTPException(409, {
        message: "A feature can't belong to another feature",
      });
    }
    await lockFeature(tx, featureId, task.projectId);
  }
  const [updated] = await tx
    .update(taskTable)
    .set({ featureId })
    .where(eq(taskTable.id, task.id))
    .returning();
  if (!updated) {
    throw new HTTPException(500, { message: "Failed to update the feature" });
  }
  await recordFeatureChange(tx, {
    taskIds: [task.id],
    projectId: task.projectId,
    from: task.featureId,
    to: featureId,
    userId,
  });
  return updated;
}

// Turns a task (locked FOR UPDATE by the caller) into a feature or back. A
// task becoming a feature leaves its own feature first; a feature can only
// become a task once it has no tasks left.
export async function setTaskType(
  tx: Tx,
  task: Task,
  type: TaskType,
  userId?: string,
) {
  if (type === task.type) return task;
  if (type === "task") {
    const [members] = await tx
      .select({ count: count() })
      .from(taskTable)
      .where(eq(taskTable.featureId, task.id));
    if ((members?.count ?? 0) > 0) {
      throw new HTTPException(409, {
        message:
          "This feature still has tasks. Move them out of it before making it a task.",
      });
    }
  }
  const [updated] = await tx
    .update(taskTable)
    .set({ type, featureId: null })
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
  if (task.featureId) {
    await recordFeatureChange(tx, {
      taskIds: [task.id],
      projectId: task.projectId,
      from: task.featureId,
      to: null,
      userId,
    });
  }
  return updated;
}
