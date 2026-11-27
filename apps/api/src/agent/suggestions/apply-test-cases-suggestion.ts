import { createLinkedTestCases } from "../../test-case/create-linked-test-cases";
import type { TestCasesSuggestion } from "../agent-types";
import { agentError } from "../agent-error";
import type { AgentTask } from "../controllers/load-agent-task";

/** Creates the suggested test cases, all or none, linked to their target. */
export async function applyTestCasesSuggestion(
  task: AgentTask["task"],
  suggestion: TestCasesSuggestion,
  userId: string,
) {
  const link =
    suggestion.target === "bug"
      ? { bugId: task.id }
      : suggestion.milestoneId && { milestoneId: suggestion.milestoneId };
  if (!link) throw agentError("AI_AGENT_SUGGESTION_OUTDATED");
  await createLinkedTestCases({
    projectId: task.projectId,
    workspaceId: task.workspaceId,
    link,
    cases: suggestion.cases,
    createdBy: userId,
  });
}
