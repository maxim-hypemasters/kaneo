import { eq } from "drizzle-orm";
import db from "../../database";
import { taskAgentAssessmentTable } from "../../database/schema";
import type { ReadinessSuggestion } from "../agent-types";
import { agentError } from "../agent-error";

/** Where a removed suggestion was, so it can be put back. */
export type RemovedSuggestion = {
  suggestion: ReadinessSuggestion;
  index: number;
  assessedAt: Date;
};

// The field kind a dismissal hides from later assessments, if any.
function dismissedKind(suggestion: ReadinessSuggestion) {
  if (suggestion.kind === undefined || suggestion.kind === "description")
    return suggestion.origin ?? null;
  return suggestion.kind;
}

/**
 * Removes a suggestion from the assessment and returns it. A dismissal also
 * records its field kind, so later assessments don't suggest it again.
 */
export async function removeSuggestion(
  taskId: string,
  suggestionId: string,
  { dismiss = false }: { dismiss?: boolean } = {},
): Promise<RemovedSuggestion> {
  return db.transaction(async (tx) => {
    const [assessment] = await tx
      .select({
        suggestions: taskAgentAssessmentTable.suggestions,
        dismissedKinds: taskAgentAssessmentTable.dismissedSuggestionKinds,
        assessedAt: taskAgentAssessmentTable.assessedAt,
      })
      .from(taskAgentAssessmentTable)
      .where(eq(taskAgentAssessmentTable.taskId, taskId))
      .for("update");
    const index =
      assessment?.suggestions.findIndex((item) => item.id === suggestionId) ??
      -1;
    const suggestion = assessment?.suggestions[index];
    if (!assessment || !suggestion)
      throw agentError("AI_AGENT_SUGGESTION_NOT_FOUND");
    const kind = dismiss ? dismissedKind(suggestion) : null;
    await tx
      .update(taskAgentAssessmentTable)
      .set({
        suggestions: assessment.suggestions.filter(
          (item) => item.id !== suggestionId,
        ),
        ...(kind && !assessment.dismissedKinds.includes(kind)
          ? { dismissedSuggestionKinds: [...assessment.dismissedKinds, kind] }
          : {}),
      })
      .where(eq(taskAgentAssessmentTable.taskId, taskId));
    return { suggestion, index, assessedAt: assessment.assessedAt };
  });
}
