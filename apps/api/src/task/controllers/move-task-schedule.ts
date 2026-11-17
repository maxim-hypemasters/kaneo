import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { projectTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { placeMovedWork } from "../../scheduling/place-moved-work";
import { assertAssignableUser } from "../../utils/assert-assignable-user";
import { assertLeafPlanning } from "../assert-leaf-planning";
import { assertAssigneeAvailable } from "../assignee-away/assert-assignee-available";
import {
  publishTaskMutation,
  recordTaskMutation,
} from "./task-mutation-effects";
import { withLockedTask } from "./with-locked-task";

// A manual move from the Gantt. It stays until the next Apply of the item's
// release re-plans it; other releases' plans reserve the new placement.
// Planned work is laid out again around its planned assignee's days away;
// a span set by hand, or unplanned work, can't start or end on a day the
// assignee is away. A lane drop moves and reassigns in one step.
export default async function moveTaskSchedule({
  id,
  start,
  end,
  exact = false,
  userId,
  timeZone,
  currentUserId,
}: {
  id: string;
  start: Date;
  end: Date;
  // The span was set by hand, e.g. by resizing the bar.
  exact?: boolean;
  // undefined keeps the assignee; null unassigns.
  userId?: string | null;
  // The zone the span was picked in; see assertAssigneeAvailable.
  timeZone?: string;
  currentUserId: string;
}) {
  const { before, after } = await withLockedTask(id, async (tx, task) => {
    assertLeafPlanning(task);
    if (!task.startDate && !task.dueDate)
      throw new HTTPException(400, {
        message: "Only scheduled work can be moved",
      });
    const [project] = await tx
      .select({
        workspaceId: projectTable.workspaceId,
        timeZone: projectTable.planningTimeZone,
      })
      .from(projectTable)
      .where(eq(projectTable.id, task.projectId));
    if (!project)
      throw new HTTPException(404, { message: "Project not found" });
    const nextUserId =
      userId === undefined ? task.userId : userId?.trim() || null;
    if (nextUserId && nextUserId !== task.userId)
      await assertAssignableUser(
        nextUserId,
        project.workspaceId,
        task.projectId,
        tx,
      );
    const placement = await placeMovedWork(
      tx,
      task,
      { start, end },
      { workspaceId: project.workspaceId, timeZone: project.timeZone ?? "UTC" },
      exact,
    );
    if (!placement)
      throw new HTTPException(400, {
        message: "The work no longer fits within the planning horizon",
      });
    await assertAssigneeAvailable(
      tx,
      [
        {
          taskId: id,
          projectId: task.projectId,
          before: task,
          after: { ...task, ...placement, userId: nextUserId },
        },
      ],
      timeZone,
    );
    const [updated] = await tx
      .update(taskTable)
      .set({ ...placement, userId: nextUserId })
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
    fields: ["dueDate", "userId"],
  });
  // A due date or assignee change has already told open boards; a move of
  // the start alone hasn't.
  if (
    before.dueDate?.getTime() === after.dueDate?.getTime() &&
    before.userId === after.userId
  )
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
