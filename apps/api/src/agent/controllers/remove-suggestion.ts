import { eq } from "drizzle-orm";
import db from "../../database";
import { taskAgentAssessmentTable } from "../../database/schema";
import type { ReadinessSuggestion } from "../agent-types";
import { agentError } from "../agent-error";

/** Removes a suggestion from the assessment and returns it. */
export async function removeSuggestion(
  taskId: string,
  suggestionId: string,
): Promise<ReadinessSuggestion> {
  return db.transaction(async (tx) => {
    const [assessment] = await tx
      .select({ suggestions: taskAgentAssessmentTable.suggestions })
      .from(taskAgentAssessmentTable)
      .where(eq(taskAgentAssessmentTable.taskId, taskId))
      .for("update");
    const suggestion = assessment?.suggestions.find(
      (item) => item.id === suggestionId,
    );
    if (!assessment || !suggestion)
      throw agentError("AI_AGENT_SUGGESTION_NOT_FOUND");
    await tx
      .update(taskAgentAssessmentTable)
      .set({
        suggestions: assessment.suggestions.filter(
          (item) => item.id !== suggestionId,
        ),
      })
      .where(eq(taskAgentAssessmentTable.taskId, taskId));
    return suggestion;
  });
}
