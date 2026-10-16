import { eq, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  assetTable,
  taskRelationTable,
  taskTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import { queueStorageCleanup } from "../../storage/cleanup-queue";
import { publishFeatureChange } from "../feature-hierarchy/publish-feature-change";
import { recordFeatureDeletion } from "../feature-hierarchy/record-feature-deletion";
import getTask from "./get-task";

async function deleteTask(taskId: string, currentUserId: string) {
  const task = await getTask(taskId);

  const relations = await db
    .select()
    .from(taskRelationTable)
    .where(
      or(
        eq(taskRelationTable.sourceTaskId, taskId),
        eq(taskRelationTable.targetTaskId, taskId),
      ),
    )
    .execute();

  const deletedTask = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({
        id: taskTable.id,
        projectId: taskTable.projectId,
        type: taskTable.type,
      })
      .from(taskTable)
      .where(eq(taskTable.id, taskId))
      .for("update");
    if (!locked) throw new HTTPException(404, { message: "Task not found" });
    if (locked.projectId !== task.projectId)
      throw new HTTPException(409, {
        message: "Task changed projects; retry the operation",
      });
    if (locked.type === "feature") {
      await recordFeatureDeletion(tx, [taskId], currentUserId);
    }
    const assets = await tx
      .select({ objectKey: assetTable.objectKey })
      .from(assetTable)
      .where(eq(assetTable.taskId, taskId));
    await queueStorageCleanup(
      tx,
      assets.map((asset) => asset.objectKey),
    );
    const [deleted] = await tx
      .delete(taskTable)
      .where(eq(taskTable.id, taskId))
      .returning();
    return deleted;
  });

  if (!deletedTask) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  await publishEvent("task.deleted", {
    taskId: task.id,
    projectId: task.projectId,
    userId: currentUserId,
    title: task.title,
  });

  if (deletedTask.featureId) {
    // Its feature's progress changed.
    await publishFeatureChange({
      projectId: task.projectId,
      featureIds: [deletedTask.featureId],
      userId: currentUserId,
    });
  }
  if (deletedTask.type === "feature") {
    // The database took its tasks out of it; refresh them all at once.
    await publishEvent("task-relation.refresh", {
      projectId: task.projectId,
      userId: currentUserId,
    });
  }

  for (const relation of relations) {
    await publishEvent("task-relation.deleted", {
      projectId: task.projectId,
      userId: currentUserId,
      taskId: taskId,
      sourceTaskId: relation.sourceTaskId,
      targetTaskId: relation.targetTaskId,
    });
  }

  return task;
}

export default deleteTask;
