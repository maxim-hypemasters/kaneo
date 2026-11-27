import updateTaskStatus from "../../task/controllers/update-task-status";
import { loadWorkflowColumns } from "./load-workflow-columns";

/**
 * Moves a task waiting in To Do to In Progress, as an ordinary status change
 * by the user. A task anywhere else stays put: work is never moved back.
 */
export async function moveTaskToInProgress(input: {
  taskId: string;
  projectId: string;
  status: string | null;
  userId: string;
}): Promise<{ moved: boolean; status: string | null }> {
  const { todo, inProgress } = await loadWorkflowColumns(input.projectId);
  if (!todo || !inProgress || input.status !== todo.slug)
    return { moved: false, status: input.status };
  const task = await updateTaskStatus({
    id: input.taskId,
    status: inProgress.slug,
    currentUserId: input.userId,
    expectedStatus: todo.slug,
  });
  return { moved: true, status: task.status };
}
