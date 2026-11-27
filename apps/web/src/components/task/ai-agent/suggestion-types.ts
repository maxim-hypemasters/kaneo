import type { AgentSuggestion } from "@/fetchers/agent/get-task-agent";

export type SuggestionKind = AgentSuggestion["kind"];

/** A value for one of the task's empty fields, set as one edit. */
export type AgentFieldSuggestion = Extract<
  AgentSuggestion,
  { kind: "assignee" | "priority" | "feature" | "milestone" | "release" }
>;

export type AgentEstimateSuggestion = Extract<
  AgentSuggestion,
  { kind: "estimate" }
>;

export type AgentTestCasesSuggestion = Extract<
  AgentSuggestion,
  { kind: "test_cases" }
>;
