import type { ReadinessSuggestion } from "../agent-types";
import { type MissingFieldsTask, testCaseTarget } from "./missing-fields";
import { hasTestCasesHeading } from "./test-cases-markdown";

/** The live state a suggestion is checked against when read or applied. */
export type SuggestionFacts = {
  task: MissingFieldsTask;
  dismissedKinds: readonly string[];
  // People who can still be assigned the task, by id, with their names.
  assignable: ReadonlyMap<string, string>;
  // Live (not archived) features of the task's project, with their titles.
  features: ReadonlyMap<string, string>;
  // Milestones of the task's project, with the feature each belongs to.
  milestones: ReadonlyMap<string, { title: string; featureId: string }>;
  releases: ReadonlyMap<string, { name: string; submissionDate: string }>;
  // Test cases linked to the bug, or to the task's milestone.
  testCases: number;
  can: { features: boolean; milestones: boolean; testCases: boolean };
};

function isVisible(suggestion: ReadinessSuggestion, facts: SuggestionFacts) {
  const { task, can } = facts;
  if (suggestion.kind === undefined || suggestion.kind === "description") {
    if (suggestion.origin !== "test_cases") return true;
    return (
      !facts.dismissedKinds.includes("test_cases") &&
      testCaseTarget(task) === "description" &&
      !hasTestCasesHeading(task.description)
    );
  }
  if (facts.dismissedKinds.includes(suggestion.kind)) return false;
  switch (suggestion.kind) {
    case "assignee":
      return !task.userId && facts.assignable.has(suggestion.userId);
    case "priority":
      return !task.priority || task.priority === "no-priority";
    case "feature":
      return (
        !task.featureId &&
        can.features &&
        facts.features.has(suggestion.featureId) &&
        (suggestion.milestoneId === null ||
          (can.milestones &&
            facts.milestones.get(suggestion.milestoneId)?.featureId ===
              suggestion.featureId))
      );
    case "milestone":
      return (
        !task.milestoneId &&
        can.milestones &&
        task.featureId !== null &&
        facts.milestones.get(suggestion.milestoneId)?.featureId ===
          task.featureId
      );
    case "release":
      return !task.releaseId && facts.releases.has(suggestion.releaseId);
    case "estimate":
      return task.estimateSeconds === null;
    case "test_cases":
      return (
        can.testCases &&
        testCaseTarget(task) === suggestion.target &&
        (suggestion.target === "bug" ||
          (can.milestones && task.milestoneId === suggestion.milestoneId)) &&
        facts.testCases === 0
      );
  }
}

/**
 * The suggestions still worth showing: not dismissed, for a field that is
 * still empty, pointing at things that still exist and the viewer can read.
 */
export function visibleSuggestions<T extends ReadinessSuggestion>(
  suggestions: readonly T[],
  facts: SuggestionFacts,
): T[] {
  return suggestions.filter((suggestion) => isVisible(suggestion, facts));
}
