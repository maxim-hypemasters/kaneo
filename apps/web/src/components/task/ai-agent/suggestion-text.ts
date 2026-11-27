import type { TFunction } from "i18next";
import { formatEstimate } from "@/components/task/estimate/effort";
import { formatDateShort } from "@/lib/format";
import { getPriorityLabel } from "@/lib/i18n/domain";
import type {
  AgentEstimateSuggestion,
  AgentFieldSuggestion,
  AgentTestCasesSuggestion,
} from "./suggestion-types";

const KEY = "tasks:aiAgent.suggestions";

/** What Apply sets, in a few words: "Assign to Alice", "Release: 2.0". */
export function fieldSuggestionText(
  suggestion: AgentFieldSuggestion,
  t: TFunction,
): string {
  switch (suggestion.kind) {
    case "assignee":
      return t(`${KEY}.assignee`, { name: suggestion.user.name });
    case "priority":
      return t(`${KEY}.priority`, {
        priority: getPriorityLabel(suggestion.priority),
      });
    case "feature":
      return suggestion.milestone
        ? t(`${KEY}.featureWithMilestone`, {
            feature: suggestion.feature.title,
            milestone: suggestion.milestone.title,
          })
        : t(`${KEY}.feature`, { feature: suggestion.feature.title });
    case "milestone":
      return t(`${KEY}.milestone`, { milestone: suggestion.milestone.title });
    case "release":
      return t(`${KEY}.release`, { release: suggestion.release.name });
  }
}

/** The effort, written the way the task's Estimate field writes it. */
export function estimateText(
  suggestion: AgentEstimateSuggestion,
  t: TFunction,
): string {
  return t(`${KEY}.estimate`, {
    estimate: formatEstimate(suggestion.minutes * 60),
  });
}

/** Where Apply puts the task's dates, or why it sets none. */
export function estimatePlanText(
  suggestion: AgentEstimateSuggestion,
  t: TFunction,
): string {
  const { plan } = suggestion;
  if (!plan)
    return t(
      suggestion.keepsDates
        ? `${KEY}.estimateKeepsDates`
        : `${KEY}.estimateOnly`,
    );
  return t(
    plan.suggestedAssignee
      ? `${KEY}.estimateAssigns`
      : `${KEY}.estimatePlanned`,
    {
      name: plan.assignee.name,
      start: formatDateShort(plan.startDate),
      due: formatDateShort(plan.dueDate),
    },
  );
}

/** How many test cases Apply creates, and where they go. */
export function testCasesText(
  suggestion: AgentTestCasesSuggestion,
  t: TFunction,
): string {
  const count = suggestion.cases.length;
  if (suggestion.target === "bug") return t(`${KEY}.testCasesBug`, { count });
  return suggestion.milestone
    ? t(`${KEY}.testCasesMilestone`, {
        count,
        milestone: suggestion.milestone.title,
      })
    : t(`${KEY}.testCases`, { count });
}
