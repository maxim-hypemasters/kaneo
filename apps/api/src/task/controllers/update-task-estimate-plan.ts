import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { validateDateRange } from "../../utils/validate-dates";
import { assertLeafPlanning } from "../assert-leaf-planning";
import { assertAssigneeAvailable } from "../assignee-away/assert-assignee-available";
import { assertEstimateSeconds } from "../estimate";
import {
  publishTaskMutation,
  recordTaskMutation,
} from "./task-mutation-effects";
import { withLockedTask } from "./with-locked-task";

// Sets a Task's or Bug's estimate, with the dates planned for it. Dates are
// written as if set by hand: planned work stops following its estimate (its
// planned segments go) until the next Apply plans it again, and neither date
// may fall on a day the assignee is away (read in the project's planning
// zone, where the dates were planned). An undefined date is kept; null
// clears it.
export async function updateTaskEstimatePlan({
  id,
  estimateSeconds,
  startDate,
  dueDate,
  currentUserId,
}: {
  id: string;
  estimateSeconds: number | null;
  startDate?: Date | null;
  dueDate?: Date | null;
  currentUserId: string;
}) {
  assertEstimateSeconds(estimateSeconds);
  let datesChanged = false;
  const { before, after } = await withLockedTask(id, async (tx, task) => {
    assertLeafPlanning(task);
    const nextStart = startDate === undefined ? task.startDate : startDate;
    const nextDue = dueDate === undefined ? task.dueDate : dueDate;
    datesChanged =
      nextStart?.getTime() !== task.startDate?.getTime() ||
      nextDue?.getTime() !== task.dueDate?.getTime();
    if (!datesChanged && estimateSeconds === task.estimateSeconds) return task;
    if (datesChanged) {
      validateDateRange(nextStart, nextDue);
      await assertAssigneeAvailable(tx, [
        {
          taskId: id,
          projectId: task.projectId,
          before: task,
          after: {
            ...task,
            startDate: nextStart,
            dueDate: nextDue,
            scheduleSegments: null,
          },
        },
      ]);
    }
    const [updated] = await tx
      .update(taskTable)
      .set({
        estimateSeconds,
        ...(datesChanged
          ? { startDate: nextStart, dueDate: nextDue, scheduleSegments: null }
          : {}),
      })
      .where(eq(taskTable.id, id))
      .returning();
    if (!updated)
      throw new HTTPException(500, {
        message: "Failed to update task estimate",
      });
    await recordTaskMutation(tx, task, { dueDate: nextDue }, currentUserId);
    return updated;
  });

  if (before === after) return after;
  await publishTaskMutation(before, after, currentUserId, {
    fields: ["dueDate"],
  });
  await publishEvent("task.updated", {
    taskId: after.id,
    projectId: after.projectId,
    title: after.title,
    status: after.status,
    userId: currentUserId,
  });
  if (datesChanged)
    await publishEvent("project-schedule.changed", {
      projectId: after.projectId,
      userId: currentUserId,
    });
  return after;
}
