import type { FieldSuggestionKind, TestCaseTarget } from "../agent-types";
import { hasTestCasesHeading } from "./test-cases-markdown";

export type MissingFieldsTask = {
  type: string;
  userId: string | null;
  priority: string | null;
  featureId: string | null;
  milestoneId: string | null;
  releaseId: string | null;
  estimateSeconds: number | null;
  description: string | null;
};

/** Where test cases for this task belong. */
export function testCaseTarget(
  task: Pick<MissingFieldsTask, "type" | "milestoneId">,
): TestCaseTarget {
  if (task.type === "bug") return "bug";
  return task.milestoneId ? "milestone" : "description";
}

/**
 * The fields of a task or bug the agent may fill in: those still empty that
 * have something to choose from. `testCases` counts the test cases of the
 * bug, or of the task's milestone.
 */
export function missingFields(input: {
  task: MissingFieldsTask;
  hasFeatures: boolean;
  featureHasMilestones: boolean;
  hasReleases: boolean;
  testCases: number;
}): FieldSuggestionKind[] {
  const { task } = input;
  const missing: FieldSuggestionKind[] = [];
  if (!task.userId) missing.push("assignee");
  if (!task.priority || task.priority === "no-priority")
    missing.push("priority");
  if (!task.featureId && input.hasFeatures) missing.push("feature");
  if (task.featureId && !task.milestoneId && input.featureHasMilestones)
    missing.push("milestone");
  if (!task.releaseId && input.hasReleases) missing.push("release");
  if (task.estimateSeconds === null) missing.push("estimate");
  const hasTestCases =
    testCaseTarget(task) === "description"
      ? hasTestCasesHeading(task.description)
      : input.testCases > 0;
  if (!hasTestCases) missing.push("test_cases");
  return missing;
}
