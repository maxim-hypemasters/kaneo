import { assertLeafPlanning } from "../assert-leaf-planning";
import { assertAssigneeAvailable } from "../assignee-away/assert-assignee-available";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { withLockedTask } from "./with-locked-task";
import { taskTable } from "../../database/schema";
import { publishTaskMutation } from "./task-mutation-effects";
import {
  assertAssignableUser,
  getProjectWorkspaceId,
} from "../../utils/assert-assignable-user";

// Work whose dates were set by hand can't go to someone away on its start
// or due day. Planned work keeps its planned assignee until the next Apply.
async function updateTaskAssignee({
  id,
  userId,
  timeZone,
  currentUserId,
}: {
  id: string;
  userId: string | null;
  // The zone the task's dates are read in; see assertAssigneeAvailable.
  timeZone?: string;
  currentUserId: string;
}) {
  const { before: existingTask, after: updatedTask } = await withLockedTask(
    id,
    async (tx, existingTask) => {
      assertLeafPlanning(existingTask);
      const nextAssigneeId = userId?.trim() || null;
      if (existingTask.userId === nextAssigneeId) {
        return existingTask;
      }

      if (nextAssigneeId) {
        await assertAssignableUser(
          nextAssigneeId,
          await getProjectWorkspaceId(existingTask.projectId, tx),
          existingTask.projectId,
          tx,
        );
      }
      await assertAssigneeAvailable(
        tx,
        [
          {
            taskId: id,
            projectId: existingTask.projectId,
            before: existingTask,
            after: { ...existingTask, userId: nextAssigneeId },
          },
        ],
        timeZone,
      );

      const [updatedTask] = await tx
        .update(taskTable)
        .set({ userId: nextAssigneeId })
        .where(eq(taskTable.id, id))
        .returning();

      if (!updatedTask) {
        throw new HTTPException(500, {
          message: "Failed to update task assignee",
        });
      }

      return updatedTask;
    },
  );

  await publishTaskMutation(existingTask, updatedTask, currentUserId, {
    fields: ["userId"],
  });

  return updatedTask;
}

export default updateTaskAssignee;
