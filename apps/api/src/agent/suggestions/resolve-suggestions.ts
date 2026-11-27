import { eq } from "drizzle-orm";
import db from "../../database";
import { userTable } from "../../database/schema";
import type { EstimateSuggestion, ReadinessSuggestion } from "../agent-types";
import type { AgentTask } from "../controllers/load-agent-task";
import type { AgentSuggestion } from "../response";
import {
  loadSuggestionFacts,
  type PermissionCheck,
} from "./load-suggestion-facts";
import { planSuggestedEstimate } from "./plan-suggested-estimate";
import {
  type SuggestionFacts,
  visibleSuggestions,
} from "./visible-suggestions";

type ResolvedPlan = Extract<AgentSuggestion, { kind: "estimate" }>["plan"];

async function resolvePlan(
  task: AgentTask["task"],
  estimate: EstimateSuggestion,
  visible: readonly ReadinessSuggestion[],
  facts: SuggestionFacts,
  can: PermissionCheck,
): Promise<ResolvedPlan> {
  const plan = await planSuggestedEstimate({
    task,
    minutes: estimate.minutes,
    visible,
    can,
  });
  if (!plan) return null;
  const name = plan.suggestedAssignee
    ? facts.assignable.get(plan.assigneeId)
    : (
        await db
          .select({ name: userTable.name })
          .from(userTable)
          .where(eq(userTable.id, plan.assigneeId))
          .limit(1)
      )[0]?.name;
  return {
    assignee: { id: plan.assigneeId, name: name ?? "" },
    suggestedAssignee: plan.suggestedAssignee,
    startDate: plan.startDate,
    dueDate: plan.dueDate,
  };
}

function resolve(
  suggestion: ReadinessSuggestion,
  facts: SuggestionFacts,
  estimate: { keepsDates: boolean; plan: ResolvedPlan },
): AgentSuggestion {
  const milestoneRef = (id: string) => ({
    id,
    title: facts.milestones.get(id)?.title ?? "",
  });
  switch (suggestion.kind) {
    case undefined:
    case "description":
      return {
        kind: "description",
        id: suggestion.id,
        title: suggestion.title,
        markdown: suggestion.markdown,
      };
    case "assignee":
      return {
        kind: "assignee",
        id: suggestion.id,
        reason: suggestion.reason,
        user: {
          id: suggestion.userId,
          name: facts.assignable.get(suggestion.userId) ?? "",
        },
      };
    case "priority":
      return suggestion;
    case "feature":
      return {
        kind: "feature",
        id: suggestion.id,
        reason: suggestion.reason,
        feature: {
          id: suggestion.featureId,
          title: facts.features.get(suggestion.featureId) ?? "",
        },
        milestone: suggestion.milestoneId
          ? milestoneRef(suggestion.milestoneId)
          : null,
      };
    case "milestone":
      return {
        kind: "milestone",
        id: suggestion.id,
        reason: suggestion.reason,
        milestone: milestoneRef(suggestion.milestoneId),
      };
    case "release": {
      const release = facts.releases.get(suggestion.releaseId);
      return {
        kind: "release",
        id: suggestion.id,
        reason: suggestion.reason,
        release: {
          id: suggestion.releaseId,
          name: release?.name ?? "",
          submissionDate: release?.submissionDate ?? "",
        },
      };
    }
    case "estimate":
      return { ...suggestion, ...estimate };
    case "test_cases":
      return {
        kind: "test_cases",
        id: suggestion.id,
        reason: suggestion.reason,
        target: suggestion.target,
        milestone: suggestion.milestoneId
          ? milestoneRef(suggestion.milestoneId)
          : null,
        cases: suggestion.cases,
      };
  }
}

/**
 * The stored suggestions the viewer should see, with the names of what they
 * point at, and the dates an estimate would set.
 */
export async function resolveSuggestions({
  task,
  suggestions,
  dismissedKinds,
  can,
}: {
  task: AgentTask["task"];
  suggestions: readonly ReadinessSuggestion[];
  dismissedKinds: readonly string[];
  can: PermissionCheck;
}): Promise<AgentSuggestion[]> {
  if (!suggestions.length) return [];
  const facts = await loadSuggestionFacts(
    task,
    suggestions,
    dismissedKinds,
    can,
  );
  const visible = visibleSuggestions(suggestions, facts);
  const estimate = visible.find(
    (item): item is EstimateSuggestion => item.kind === "estimate",
  );
  const plan = estimate
    ? await resolvePlan(task, estimate, visible, facts, can)
    : null;
  const keepsDates = task.startDate !== null || task.dueDate !== null;
  return visible.map((suggestion) =>
    resolve(suggestion, facts, { keepsDates, plan }),
  );
}
