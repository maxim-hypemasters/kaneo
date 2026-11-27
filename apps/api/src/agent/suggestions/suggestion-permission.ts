import type { PermissionMap } from "../../utils/role-permissions";
import type { ReadinessSuggestion } from "../agent-types";

/**
 * What applying the suggestion needs beyond editing the task, as the
 * matching task and test case routes require; null when nothing more.
 */
export function suggestionPermission(
  suggestion: ReadinessSuggestion,
): PermissionMap | null {
  switch (suggestion.kind) {
    case "assignee":
      return { task: ["assign"] };
    case "test_cases":
      return suggestion.target === "bug"
        ? { test_case: ["create"], bug: ["read"] }
        : { test_case: ["create"], milestone: ["read"] };
    default:
      return null;
  }
}
