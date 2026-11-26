import { eq } from "drizzle-orm";
import db from "../../database";
import { taskAgentAssessmentTable } from "../../database/schema";
import updateTaskDescription from "../../task/controllers/update-task-description";
import { agentError } from "../agent-error";
import { publishAgentUpdate } from "./publish-agent-update";
import { removeSuggestion } from "./remove-suggestion";
import { requireAgentTask } from "./require-agent-task";

/**
 * Appends a suggestion to the description through the ordinary description
 * update, so activity, mentions and live updates behave as for a user edit.
 */
export async function applySuggestion(
  taskId: string,
  suggestionId: string,
  userId: string,
) {
  const { task } = await requireAgentTask(taskId);
  const [assessment] = await db
    .select({ suggestions: taskAgentAssessmentTable.suggestions })
    .from(taskAgentAssessmentTable)
    .where(eq(taskAgentAssessmentTable.taskId, taskId))
    .limit(1);
  const suggestion = assessment?.suggestions.find(
    (item) => item.id === suggestionId,
  );
  if (!suggestion) throw agentError("AI_AGENT_SUGGESTION_NOT_FOUND");

  const current = task.description ?? "";
  const description = current.trim()
    ? `${current.trimEnd()}\n\n${suggestion.markdown}`
    : suggestion.markdown;
  await updateTaskDescription({
    id: taskId,
    description,
    expectedDescription: current,
    currentUserId: userId,
    expectedProjectId: task.projectId,
    expectedWorkspaceId: task.workspaceId,
  });
  await removeSuggestion(taskId, suggestionId).catch(() => {});
  await publishAgentUpdate(taskId, task.projectId);
}
