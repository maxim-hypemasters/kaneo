import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { projectTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { movePlacement } from "../../scheduling/move-placement";
import { assertLeafPlanning } from "../assert-leaf-planning";
import {
  publishTaskMutation,
  recordTaskMutation,
} from "./task-mutation-effects";
import { withLockedTask } from "./with-locked-task";

// A manual move from the Gantt. It stays until the next Apply of the item's
// release re-plans it; other releases' plans reserve the new placement.
export default async function moveTaskSchedule({
  id,
  start,
  end,
  exact = false,
  currentUserId,
}: {
  id: string;
  start: Date;
  end: Date;
  // The span was set by hand, e.g. by resizing the bar.
  exact?: boolean;
  currentUserId: string;
}) {
  const { before, after } = await withLockedTask(id, async (tx, task) => {
    assertLeafPlanning(task);
    if (!task.startDate && !task.dueDate)
      throw new HTTPException(400, {
        message: "Only scheduled work can be moved",
      });
    const [project] = await tx
      .select({ timeZone: projectTable.planningTimeZone })
      .from(projectTable)
      .where(eq(projectTable.id, task.projectId));
    const placement = movePlacement(
      task,
      { start, end },
      project?.timeZone ?? "UTC",
      exact,
    );
    if (!placement)
      throw new HTTPException(400, {
        message: "The work no longer fits within the planning horizon",
      });
    const [updated] = await tx
      .update(taskTable)
      .set(placement)
      .where(eq(taskTable.id, id))
      .returning();
    if (!updated)
      throw new HTTPException(500, { message: "Failed to move task" });
    await recordTaskMutation(
      tx,
      task,
      { dueDate: updated.dueDate },
      currentUserId,
    );
    return updated;
  });

  await publishTaskMutation(before, after, currentUserId, {
    fields: ["dueDate"],
  });
  // A due date change has already told open boards; a start-only move hasn't.
  if (before.dueDate?.getTime() === after.dueDate?.getTime())
    await publishEvent("task.updated", {
      taskId: id,
      projectId: after.projectId,
      userId: currentUserId,
    });
  await publishEvent("project-schedule.changed", {
    projectId: after.projectId,
    userId: currentUserId,
  });
  return after;
}
