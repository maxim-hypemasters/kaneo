import { publishAgentUpdate } from "./publish-agent-update";
import { removeSuggestion } from "./remove-suggestion";
import { requireAgentTask } from "./require-agent-task";

/** Drops a suggestion; a field suggestion's kind stays dismissed. */
export async function dismissSuggestion(taskId: string, suggestionId: string) {
  const { task } = await requireAgentTask(taskId);
  await removeSuggestion(taskId, suggestionId, { dismiss: true });
  await publishAgentUpdate(taskId, task.projectId);
}
