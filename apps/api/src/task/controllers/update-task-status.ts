import { assertLeafPlanning } from "../assert-leaf-planning";
import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { ApiError } from "../../errors/api-error";
import { withLockedTask } from "./with-locked-task";
import { columnTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { publishTaskMutation } from "./task-mutation-effects";
import { assertValidTaskStatus } from "../validate-task-fields";
import { assertTriageTransition } from "../../triage/triage-status";

// currentUserId is null when Kaneo moves the task itself, as integrations do.
// expectedStatus makes the move conditional: it is refused with 409 when the
// task left that status meanwhile.
async function updateTaskStatus({
  id,
  status,
  currentUserId,
  expectedStatus,
}: {
  id: string;
  status: string;
  currentUserId: string | null;
  expectedStatus?: string;
}) {
  const { before: existingTask, after: updatedTask } = await withLockedTask(
    id,
    async (tx, existingTask) => {
      if (
        expectedStatus !== undefined &&
        existingTask.status !== expectedStatus
      )
        throw new ApiError(409, {
          message: "The task's status changed meanwhile",
          code: "TASK_STATUS_CONFLICT",
        });
      assertLeafPlanning(existingTask);
      assertTriageTransition(existingTask.status, status);
      await assertValidTaskStatus(status, existingTask.projectId, tx);

      const column = await tx.query.columnTable.findFirst({
        where: and(
          eq(columnTable.projectId, existingTask.projectId),
          eq(columnTable.slug, status),
        ),
      });

      const [updatedTask] = await tx
        .update(taskTable)
        .set({ status, columnId: column?.id ?? null })
        .where(eq(taskTable.id, id))
        .returning();

      if (!updatedTask) {
        throw new HTTPException(500, {
          message: "Failed to update task status",
        });
      }

      return updatedTask;
    },
  );

  await publishTaskMutation(
    existingTask,
    updatedTask,
    currentUserId ?? undefined,
    { fields: ["status"] },
  );

  if (
    existingTask.status === updatedTask.status &&
    existingTask.columnId !== updatedTask.columnId
  )
    await publishEvent("task.updated", {
      taskId: updatedTask.id,
      projectId: updatedTask.projectId,
      userId: currentUserId,
    });

  return updatedTask;
}

export default updateTaskStatus;
