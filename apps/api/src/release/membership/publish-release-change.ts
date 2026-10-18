import { publishEvent } from "../../events";

// Boards patch a task from its own TASK_UPDATED message, so a membership
// change announces every task whose release changed. Call after commit.
export async function publishReleaseChange({
  projectId,
  taskIds,
  userId,
}: {
  projectId: string;
  taskIds: readonly string[];
  userId?: string;
}) {
  for (const taskId of new Set(taskIds)) {
    await publishEvent("task.updated", { taskId, projectId, userId });
  }
}
