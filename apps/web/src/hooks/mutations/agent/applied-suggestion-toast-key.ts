import type { AppliedSuggestion } from "@/fetchers/agent/apply-task-agent-suggestion";

const FIELD = "tasks:aiAgent.toast.appliedField";

const TOAST_KEYS: Record<AppliedSuggestion["kind"], string> = {
  description: "tasks:aiAgent.toast.applied",
  assignee: `${FIELD}.assignee`,
  priority: `${FIELD}.priority`,
  feature: `${FIELD}.feature`,
  milestone: `${FIELD}.milestone`,
  release: `${FIELD}.release`,
  estimate: `${FIELD}.estimate`,
  test_cases: `${FIELD}.testCases`,
};

/** What Apply says it did; an estimate may also assign and set dates. */
export function appliedSuggestionToastKey(
  result: Pick<AppliedSuggestion, "kind" | "assigneeChanged" | "datesChanged">,
): string {
  if (result.kind === "estimate" && result.datesChanged)
    return result.assigneeChanged
      ? `${FIELD}.estimateWithAssignee`
      : `${FIELD}.estimateWithDates`;
  return TOAST_KEYS[result.kind];
}
