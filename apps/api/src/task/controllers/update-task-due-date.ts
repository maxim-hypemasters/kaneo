import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { validateDateRange } from "../../utils/validate-dates";
import { assertLeafPlanning } from "../assert-leaf-planning";
import {
  publishTaskMutation,
  recordTaskMutation,
} from "./task-mutation-effects";
import { withLockedTask } from "./with-locked-task";

// A due date set by hand. Planned work stops following its estimate (its
// planned segments are dropped) until the next Apply of its release plans
// it again.
async function updateTaskDueDate({
  id,
  dueDate,
  currentUserId,
}: {
  id: string;
  dueDate: Date | null;
  currentUserId: string;
}) {
  const { before, after } = await withLockedTask(id, async (tx, task) => {
    assertLeafPlanning(task);
    if (task.dueDate?.getTime() === dueDate?.getTime()) return task;
    validateDateRange(task.startDate, dueDate);
    const [updated] = await tx
      .update(taskTable)
      .set({ dueDate, scheduleSegments: null })
      .where(eq(taskTable.id, id))
      .returning();
    if (!updated)
      throw new HTTPException(500, {
        message: "Failed to update task due date",
      });
    await recordTaskMutation(tx, task, { dueDate }, currentUserId);
    return updated;
  });

  if (before.dueDate?.getTime() !== after.dueDate?.getTime()) {
    await publishTaskMutation(before, after, currentUserId, {
      fields: ["dueDate"],
    });
    await publishEvent("project-schedule.changed", {
      projectId: after.projectId,
      userId: currentUserId,
    });
  }

  return after;
}

export default updateTaskDueDate;
