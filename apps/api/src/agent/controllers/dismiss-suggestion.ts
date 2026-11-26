import { publishAgentUpdate } from "./publish-agent-update";
import { removeSuggestion } from "./remove-suggestion";
import { requireAgentTask } from "./require-agent-task";

export async function dismissSuggestion(taskId: string, suggestionId: string) {
  const { task } = await requireAgentTask(taskId);
  await removeSuggestion(taskId, suggestionId);
  await publishAgentUpdate(taskId, task.projectId);
}
