import { publishEvent } from "../../events";

// Boards patch a task from its own TASK_UPDATED message, so a membership
// change announces the task and each feature whose progress it changed.
export async function publishFeatureChange({
  projectId,
  taskId,
  featureIds,
  userId,
}: {
  projectId: string;
  taskId?: string;
  featureIds: ReadonlyArray<string | null | undefined>;
  userId?: string;
}) {
  const ids = new Set(
    [taskId, ...featureIds].filter((id): id is string => !!id),
  );
  for (const id of ids) {
    await publishEvent("task.updated", { taskId: id, projectId, userId });
  }
}
