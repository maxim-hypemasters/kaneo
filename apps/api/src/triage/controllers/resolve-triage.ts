import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import createComment from "../../activity/controllers/create-comment";
import db from "../../database";
import { projectTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { publishTaskMutation } from "../../task/controllers/task-mutation-effects";
import { nextTaskPosition } from "../../task/controllers/next-task-position";
import { withLockedTask } from "../../task/controllers/with-locked-task";
import { resolveAcceptTarget } from "../accept-target";
import { TRIAGE_STATUS } from "../triage-status";

export type TriageOutcome = "accepted" | "declined";

export default async function resolveTriage({
  taskId,
  outcome,
  reason,
  currentUserId,
}: {
  taskId: string;
  outcome: TriageOutcome;
  reason?: string;
  currentUserId: string;
}) {
  const [current] = await db
    .select({ projectId: taskTable.projectId })
    .from(taskTable)
    .where(eq(taskTable.id, taskId));
  if (!current) throw new HTTPException(404, { message: "Task not found" });
  const { before, after } = await withLockedTask(
    taskId,
    async (tx, task) => {
      if (task.projectId !== current.projectId)
        throw new HTTPException(409, {
          message: "Task changed projects; retry",
        });
      if (task.status !== TRIAGE_STATUS)
        throw new HTTPException(409, {
          message: "This task is no longer waiting in Triage",
        });
      const target =
        outcome === "accepted"
          ? await resolveAcceptTarget(tx, task.projectId)
          : { status: "archived", columnId: null };
      // Decided work joins the end of its new column, like new work does.
      const position = await nextTaskPosition(
        tx,
        task.projectId,
        target.status,
        target.columnId,
      );
      const [updated] = await tx
        .update(taskTable)
        .set({ ...target, position })
        .where(eq(taskTable.id, taskId))
        .returning();
      if (!updated)
        throw new HTTPException(500, { message: "Failed to update the task" });
      return updated;
    },
    // Position allocation needs the project lock, taken before the task's.
    async (tx) => {
      await tx
        .select({ id: projectTable.id })
        .from(projectTable)
        .where(eq(projectTable.id, current.projectId))
        .for("update");
    },
  );

  await publishTaskMutation(before, after, currentUserId, {
    fields: ["status"],
    statusActivityType: `triage_${outcome}`,
  });
  const comment = reason?.trim();
  if (outcome === "declined" && comment)
    await createComment(taskId, currentUserId, comment);
  await publishEvent("task.triage_resolved", {
    taskId,
    projectId: after.projectId,
    title: after.title,
    createdBy: after.createdBy,
    userId: currentUserId,
    outcome,
    reason: comment || null,
  });
  return after;
}
