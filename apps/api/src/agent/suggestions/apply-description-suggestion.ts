import updateTaskDescription from "../../task/controllers/update-task-description";
import type { DescriptionSuggestion } from "../agent-types";
import type { AgentTask } from "../controllers/load-agent-task";

/**
 * Appends a suggestion to the description through the ordinary description
 * update, so activity, mentions and live updates behave as for a user edit.
 */
export async function applyDescriptionSuggestion(
  task: AgentTask["task"],
  suggestion: DescriptionSuggestion,
  userId: string,
) {
  const current = task.description ?? "";
  await updateTaskDescription({
    id: task.id,
    description: current.trim()
      ? `${current.trimEnd()}\n\n${suggestion.markdown}`
      : suggestion.markdown,
    expectedDescription: current,
    currentUserId: userId,
    expectedProjectId: task.projectId,
    expectedWorkspaceId: task.workspaceId,
  });
}
