import type { AgentSuggestion } from "@/fetchers/agent/get-task-agent";
import type {
  AgentEstimateSuggestion,
  AgentTestCasesSuggestion,
} from "./suggestion-types";

// Suggestions as the API returns them, for tests.

export const assigneeSuggestion: AgentSuggestion = {
  kind: "assignee",
  id: "s-assignee",
  reason: "Alice built the export screens.",
  user: { id: "u-alice", name: "Alice" },
};

export const prioritySuggestion: AgentSuggestion = {
  kind: "priority",
  id: "s-priority",
  reason: "Customers asked for it this week.",
  priority: "high",
};

export const featureSuggestion: AgentSuggestion = {
  kind: "feature",
  id: "s-feature",
  reason: "It extends data export.",
  feature: { id: "f1", title: "Data export" },
  milestone: { id: "m1", title: "CSV" },
};

export const milestoneSuggestion: AgentSuggestion = {
  kind: "milestone",
  id: "s-milestone",
  reason: "",
  milestone: { id: "m2", title: "Beta" },
};

export const releaseSuggestion: AgentSuggestion = {
  kind: "release",
  id: "s-release",
  reason: "The next release ships exports.",
  release: { id: "r1", name: "2.0", submissionDate: "2026-12-15" },
};

export function estimateSuggestion(
  overrides: Partial<AgentEstimateSuggestion> = {},
): AgentEstimateSuggestion {
  return {
    kind: "estimate",
    id: "s-estimate",
    reason: "Two screens and an endpoint.",
    minutes: 960,
    keepsDates: false,
    plan: {
      assignee: { id: "u-alice", name: "Alice" },
      suggestedAssignee: false,
      startDate: "2026-12-01T12:00:00.000Z",
      dueDate: "2026-12-03T12:00:00.000Z",
    },
    ...overrides,
  };
}

export function testCasesSuggestion(
  overrides: Partial<AgentTestCasesSuggestion> = {},
): AgentTestCasesSuggestion {
  return {
    kind: "test_cases",
    id: "s-test-cases",
    reason: "",
    target: "bug",
    milestone: null,
    cases: [
      {
        title: "Export an empty project",
        steps: "Open an empty project\nExport as CSV",
        expectedResult: "The file has only the header row",
      },
      { title: "Export 10,000 tasks", steps: null, expectedResult: null },
    ],
    ...overrides,
  };
}

export const descriptionSuggestion: AgentSuggestion = {
  kind: "description",
  id: "s-description",
  title: "Acceptance criteria",
  markdown: "- Exports include archived tasks",
};
