import { and, eq } from "drizzle-orm";
import db from "../../database";
import { agentRunTable } from "../../database/schema";
import { moveTaskToInProgress } from "./move-task-to-in-progress";

/**
 * Moves the task to In Progress as work on it starts, and marks the queued
 * run, if any, so a run that never starts moves it back. A failed move
 * deletes that run while no runner has claimed it: the caller's error must
 * neither leave work queued nor show up as the task's last run.
 */
export async function moveTaskForWorkRun(
  task: { id: string; projectId: string; status: string | null },
  userId: string,
  runId: string | null,
) {
  try {
    const result = await moveTaskToInProgress({
      taskId: task.id,
      projectId: task.projectId,
      status: task.status,
      userId,
    });
    if (result.moved && runId)
      await db
        .update(agentRunTable)
        .set({ movedTask: true })
        .where(eq(agentRunTable.id, runId));
    return result;
  } catch (error) {
    if (runId)
      await db
        .delete(agentRunTable)
        .where(
          and(eq(agentRunTable.id, runId), eq(agentRunTable.status, "queued")),
        );
    throw error;
  }
}
