export const AGENT_RUN_KINDS = ["assess", "ship", "start"] as const;
export type AgentRunKind = (typeof AGENT_RUN_KINDS)[number];

// Runs that push to the task's branch; a task has at most one active.
export const WORK_RUN_KINDS = ["ship", "start"] as const;
export type WorkRunKind = (typeof WORK_RUN_KINDS)[number];

export const FIELD_SUGGESTION_KINDS = [
  "assignee",
  "priority",
  "feature",
  "milestone",
  "release",
  "estimate",
  "test_cases",
] as const;
export type FieldSuggestionKind = (typeof FIELD_SUGGESTION_KINDS)[number];

export const AGENT_RUN_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

export const READINESS_VERDICTS = [
  "not_ready",
  "needs_clarification",
  "ready",
] as const;
export type ReadinessVerdict = (typeof READINESS_VERDICTS)[number];

export const AGENT_RUN_EVENT_KINDS = ["step", "tool", "log"] as const;
export type AgentRunEventKind = (typeof AGENT_RUN_EVENT_KINDS)[number];

// Options are ordered with the agent's recommendation first.
export type ReadinessQuestion = {
  id: string;
  text: string;
  options: string[];
  blocking: boolean;
};

export const SUGGESTION_KINDS = [
  "description",
  ...FIELD_SUGGESTION_KINDS,
] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

// "no-priority" is what a suggestion fills in, so never a suggestion itself.
export const SUGGESTED_PRIORITIES = [
  "low",
  "medium",
  "high",
  "urgent",
] as const;
export type SuggestedPriority = (typeof SUGGESTED_PRIORITIES)[number];

// Where test cases for the task belong: linked to the bug, to the task's
// milestone, or written into the description when neither exists.
export const TEST_CASE_TARGETS = ["bug", "milestone", "description"] as const;
export type TestCaseTarget = (typeof TEST_CASE_TARGETS)[number];

export type TestCaseDraft = {
  title: string;
  steps: string | null;
  expectedResult: string | null;
};

// Rows stored before typed suggestions have no kind; they are description
// suggestions. `origin` marks test cases written for the description, so
// dismissing them dismisses the test_cases kind.
export type DescriptionSuggestion = {
  kind?: "description";
  id: string;
  title: string;
  markdown: string;
  origin?: "test_cases";
};

type Field<K extends FieldSuggestionKind, T> = {
  kind: K;
  id: string;
  reason: string;
} & T;

export type AssigneeSuggestion = Field<"assignee", { userId: string }>;
export type PrioritySuggestion = Field<
  "priority",
  { priority: SuggestedPriority }
>;
export type FeatureSuggestion = Field<
  "feature",
  { featureId: string; milestoneId: string | null }
>;
export type MilestoneSuggestion = Field<"milestone", { milestoneId: string }>;
export type ReleaseSuggestion = Field<"release", { releaseId: string }>;
export type EstimateSuggestion = Field<"estimate", { minutes: number }>;
export type TestCasesSuggestion = Field<
  "test_cases",
  {
    target: "bug" | "milestone";
    // The task's milestone when the suggestion was made; null for a bug.
    milestoneId: string | null;
    cases: TestCaseDraft[];
  }
>;

export type FieldSuggestion =
  | AssigneeSuggestion
  | PrioritySuggestion
  | FeatureSuggestion
  | MilestoneSuggestion
  | ReleaseSuggestion
  | EstimateSuggestion
  | TestCasesSuggestion;

/** A suggestion as stored in task_agent_assessment.suggestions. */
export type ReadinessSuggestion = DescriptionSuggestion | FieldSuggestion;

export type ShipResult = {
  prUrl: string;
  branch: string;
  summary: string;
};
