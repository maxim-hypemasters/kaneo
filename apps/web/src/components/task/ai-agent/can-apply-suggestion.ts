import type { SuggestionKind } from "./suggestion-types";

export type SuggestionPermissions = {
  canUpdate: boolean;
  canAssign: boolean;
  canCreateTestCases: boolean;
};

/**
 * Whether the viewer may apply a suggestion of this kind. The server checks
 * the same permissions; this only hides an Apply that would be refused.
 */
export function canApplySuggestion(
  kind: SuggestionKind,
  { canUpdate, canAssign, canCreateTestCases }: SuggestionPermissions,
): boolean {
  if (!canUpdate) return false;
  if (kind === "assignee") return canAssign;
  if (kind === "test_cases") return canCreateTestCases;
  return true;
}
