import type { AgentSuggestion } from "@/fetchers/agent/get-task-agent";
import type { SuggestionKind } from "./suggestion-types";

// Field values first, in the order the properties rail lists them, then the
// test cases, then additions to the description.
const KIND_ORDER: Record<SuggestionKind, number> = {
  assignee: 0,
  priority: 1,
  feature: 2,
  milestone: 3,
  release: 4,
  estimate: 5,
  test_cases: 6,
  description: 7,
};

/** The card's rows in display order; suggestions of one kind keep theirs. */
export function orderSuggestions(
  suggestions: readonly AgentSuggestion[],
): AgentSuggestion[] {
  return suggestions
    .map((suggestion, index) => ({ suggestion, index }))
    .sort(
      (a, b) =>
        KIND_ORDER[a.suggestion.kind] - KIND_ORDER[b.suggestion.kind] ||
        a.index - b.index,
    )
    .map(({ suggestion }) => suggestion);
}
