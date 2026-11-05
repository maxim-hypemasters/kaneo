import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable, taskTable } from "../../database/schema";
import { ApiError } from "../../errors/api-error";
import { claimDescriptionAssets } from "./claim-description-assets";
import { withLockedTask } from "./with-locked-task";
import { publishTaskMutation } from "./task-mutation-effects";

async function updateTaskDescription({
  id,
  description,
  expectedDescription,
  draftAssetIds,
  currentUserId,
  expectedProjectId,
  expectedWorkspaceId,
}: {
  id: string;
  description: string;
  expectedDescription?: string;
  draftAssetIds?: string[];
  currentUserId: string;
  expectedProjectId?: string;
  expectedWorkspaceId?: string;
}) {
  const task = await db.query.taskTable.findFirst({
    columns: { projectId: true },
    where: eq(taskTable.id, id),
  });
  if (!task) throw new HTTPException(404, { message: "Task not found" });
  const projectId = expectedProjectId ?? task.projectId;
  const { before: existingTask, after: updatedTask } = await withLockedTask(
    id,
    async (tx, before) => {
      if (before.projectId !== projectId)
        throw new HTTPException(409, {
          message: "Task changed projects; retry the request",
        });
      if (
        expectedDescription !== undefined &&
        (before.description ?? "") !== expectedDescription
      )
        throw new ApiError(409, {
          message: "The description changed since editing began",
          code: "DESCRIPTION_CONFLICT",
        });
      await claimDescriptionAssets(tx, {
        taskId: id,
        projectId,
        currentUserId,
        description,
        draftAssetIds,
      });
      const [updatedTask] = await tx
        .update(taskTable)
        .set({ description })
        .where(eq(taskTable.id, id))
        .returning();
      if (!updatedTask)
        throw new HTTPException(500, {
          message: "Failed to update task description",
        });
      return updatedTask;
    },
    async (tx) => {
      const [project] = await tx
        .select({ workspaceId: projectTable.workspaceId })
        .from(projectTable)
        .where(eq(projectTable.id, projectId))
        .for("share");
      if (!project)
        throw new HTTPException(404, { message: "Project not found" });
      if (expectedWorkspaceId && project.workspaceId !== expectedWorkspaceId)
        throw new HTTPException(409, {
          message: "Project changed workspaces; retry the request",
        });
    },
  );

  await publishTaskMutation(existingTask, updatedTask, currentUserId, {
    fields: ["description"],
  });
  return updatedTask;
}

export default updateTaskDescription;
