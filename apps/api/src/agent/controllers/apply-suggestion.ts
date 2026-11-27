import { ApiError } from "../../errors/api-error";
import { agentError } from "../agent-error";
import type { ReadinessSuggestion, SuggestionKind } from "../agent-types";
import { applyDescriptionSuggestion } from "../suggestions/apply-description-suggestion";
import { applyEstimateSuggestion } from "../suggestions/apply-estimate-suggestion";
import { applyFieldSuggestion } from "../suggestions/apply-field-suggestion";
import { applyTestCasesSuggestion } from "../suggestions/apply-test-cases-suggestion";
import {
  loadSuggestionFacts,
  type PermissionCheck,
} from "../suggestions/load-suggestion-facts";
import { suggestionPermission } from "../suggestions/suggestion-permission";
import { visibleSuggestions } from "../suggestions/visible-suggestions";
import { loadAssessment } from "./get-task-agent";
import type { AgentTask } from "./load-agent-task";
import { publishAgentUpdate } from "./publish-agent-update";
import { removeSuggestion } from "./remove-suggestion";
import { requireAgentTask } from "./require-agent-task";
import { restoreSuggestion } from "./restore-suggestion";

function assertPermitted(
  suggestion: ReadinessSuggestion,
  can: PermissionCheck,
) {
  const needed = suggestionPermission(suggestion);
  if (!needed || can(needed)) return;
  throw new ApiError(403, {
    message: "Insufficient permissions",
    code: "MISSING_PERMISSION",
    missingPermissions: Object.entries(needed).flatMap(([resource, actions]) =>
      actions
        .filter((action) => !can({ [resource]: [action] }))
        .map((action) => `${resource}:${action}`),
    ),
  });
}

async function applyByKind(
  task: AgentTask["task"],
  suggestion: ReadinessSuggestion,
  visible: readonly ReadinessSuggestion[],
  userId: string,
  can: PermissionCheck,
) {
  const unchanged = { assigneeChanged: false, datesChanged: false };
  switch (suggestion.kind) {
    case undefined:
    case "description":
      await applyDescriptionSuggestion(task, suggestion, userId);
      return unchanged;
    case "estimate":
      return applyEstimateSuggestion({
        task,
        suggestion,
        visible,
        userId,
        can,
      });
    case "test_cases":
      await applyTestCasesSuggestion(task, suggestion, userId);
      return unchanged;
    default:
      await applyFieldSuggestion(task, suggestion, userId);
      return { ...unchanged, assigneeChanged: suggestion.kind === "assignee" };
  }
}

/**
 * Applies a suggestion as an ordinary edit by the caller, after checking it
 * still fits the task as it is now: a field set meanwhile gives 409
 * AI_AGENT_SUGGESTION_OUTDATED rather than being overwritten.
 */
export async function applySuggestion(
  taskId: string,
  suggestionId: string,
  userId: string,
  can: PermissionCheck,
): Promise<{
  kind: SuggestionKind;
  assigneeChanged: boolean;
  datesChanged: boolean;
}> {
  const { task } = await requireAgentTask(taskId);
  const assessment = await loadAssessment(taskId);
  const suggestion = assessment?.suggestions.find(
    (item) => item.id === suggestionId,
  );
  if (!assessment || !suggestion)
    throw agentError("AI_AGENT_SUGGESTION_NOT_FOUND");
  const facts = await loadSuggestionFacts(
    task,
    assessment.suggestions,
    assessment.dismissedSuggestionKinds,
    can,
  );
  const visible = visibleSuggestions(assessment.suggestions, facts);
  if (!visible.includes(suggestion))
    throw agentError("AI_AGENT_SUGGESTION_OUTDATED");
  assertPermitted(suggestion, can);

  const removed = await removeSuggestion(taskId, suggestionId);
  let changes: Awaited<ReturnType<typeof applyByKind>>;
  try {
    changes = await applyByKind(task, suggestion, visible, userId, can);
  } catch (error) {
    await restoreSuggestion(taskId, removed).catch(() => {});
    throw error;
  } finally {
    // An estimate may have assigned someone before failing.
    await publishAgentUpdate(taskId, task.projectId);
  }
  return { kind: suggestion.kind ?? "description", ...changes };
}
