import { recordMilestoneChange } from "../../milestone/membership";
import { and, count, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type db from "../../database";
import {
  activityTable,
  milestoneTable,
  taskTable,
} from "../../database/schema";
import { releaseForJoiningTask } from "../../release/membership/follow-feature-release";
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
// The lock also holds the feature's release, which tasks joining it take.
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
// out with null. A task without a release joins its new feature's; leaving
// or switching keeps the release it has. Returns the updated row; a no-op
// returns the task as is.
export async function setTaskFeature(
  tx: Tx,
  task: Task,
  featureId: string | null,
  userId?: string,
) {
  if (featureId === task.featureId) return task;
  let releaseId = task.releaseId;
  if (featureId) {
    if (task.type === "feature") {
      throw new HTTPException(409, {
        message: "A feature can't belong to another feature",
      });
    }
    const feature = await lockFeature(tx, featureId, task.projectId);
    releaseId = releaseForJoiningTask(task.releaseId, feature.releaseId);
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

// Leaf type changes preserve membership. Promotion to a feature clears its
// parent; demotion requires an empty feature. Every change keeps its release.
export async function setTaskType(
  tx: Tx,
  task: Task,
  type: TaskType,
  userId?: string,
) {
  if (type === task.type) return task;
  if (task.type === "feature" && type !== "feature") {
    const [members] = await tx
      .select({ count: count() })
      .from(taskTable)
      .where(eq(taskTable.featureId, task.id));
    const [milestones] = await tx
      .select({ count: count() })
      .from(milestoneTable)
      .where(eq(milestoneTable.featureId, task.id));
    if ((members?.count ?? 0) > 0 || (milestones?.count ?? 0) > 0) {
      throw new HTTPException(409, {
        message:
          "This feature still has members or milestones. Remove them before changing its type.",
      });
    }
  }
  const [updated] = await tx
    .update(taskTable)
    .set({
      type,
      featureId: type === "feature" ? null : task.featureId,
      milestoneId: type === "feature" ? null : task.milestoneId,
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
  if (type === "feature")
    await recordMilestoneChange(tx, {
      taskIds: [task.id],
      projectId: task.projectId,
      from: task.milestoneId,
      to: null,
      userId,
    });
  if (task.featureId && type === "feature") {
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
