import { eq } from "drizzle-orm";
import db from "../../database";
import { taskAgentAssessmentTable } from "../../database/schema";
import type { RemovedSuggestion } from "./remove-suggestion";

/**
 * Puts a suggestion back where it was after applying it failed, unless a
 * newer assessment replaced the one it came from.
 */
export async function restoreSuggestion(
  taskId: string,
  { suggestion, index, assessedAt }: RemovedSuggestion,
) {
  await db.transaction(async (tx) => {
    const [assessment] = await tx
      .select({
        suggestions: taskAgentAssessmentTable.suggestions,
        assessedAt: taskAgentAssessmentTable.assessedAt,
      })
      .from(taskAgentAssessmentTable)
      .where(eq(taskAgentAssessmentTable.taskId, taskId))
      .for("update");
    if (
      !assessment ||
      assessment.assessedAt.getTime() !== assessedAt.getTime() ||
      assessment.suggestions.some((item) => item.id === suggestion.id)
    )
      return;
    const suggestions = [...assessment.suggestions];
    suggestions.splice(index, 0, suggestion);
    await tx
      .update(taskAgentAssessmentTable)
      .set({ suggestions })
      .where(eq(taskAgentAssessmentTable.taskId, taskId));
  });
}
