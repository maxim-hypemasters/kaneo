import { HTTPException } from "hono/http-exception";
import updateTaskStatus from "../../task/controllers/update-task-status";
import { loadWorkflowColumns } from "./load-workflow-columns";

/**
 * Moves a task back to To Do after a work run that moved it never really
 * started. A task someone moved on since, or deleted, is left alone.
 */
export async function restoreTaskToTodo(run: {
  taskId: string;
  projectId: string;
  movedTask: boolean;
}) {
  if (!run.movedTask) return;
  const { todo, inProgress } = await loadWorkflowColumns(run.projectId);
  if (!todo || !inProgress) return;
  try {
    await updateTaskStatus({
      id: run.taskId,
      status: todo.slug,
      currentUserId: null,
      expectedStatus: inProgress.slug,
    });
  } catch (error) {
    if (
      error instanceof HTTPException &&
      (error.status === 404 || error.status === 409)
    )
      return;
    throw error;
  }
}
