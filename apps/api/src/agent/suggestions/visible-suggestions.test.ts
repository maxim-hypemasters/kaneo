import { describe, expect, it } from "vite-plus/test";
import type { ReadinessSuggestion } from "../agent-types";
import {
  type SuggestionFacts,
  visibleSuggestions,
} from "./visible-suggestions";

const facts: SuggestionFacts = {
  task: {
    type: "task",
    userId: null,
    priority: "no-priority",
    featureId: null,
    milestoneId: null,
    releaseId: null,
    estimateSeconds: null,
    description: "",
  },
  dismissedKinds: [],
  assignable: new Map([["u1", "Ada"]]),
  features: new Map([["f1", "Login"]]),
  milestones: new Map([
    ["m1", { title: "Beta", featureId: "f1" }],
    ["m2", { title: "GA", featureId: "f2" }],
  ]),
  releases: new Map([["r1", { name: "1.0", submissionDate: "2027-01-01" }]]),
  testCases: 0,
  can: { features: true, milestones: true, testCases: true },
};

const reason = "r";
const suggestions = {
  legacy: { id: "d0", title: "Old", markdown: "From before kinds" },
  description: { kind: "description", id: "d1", title: "T", markdown: "M" },
  assignee: { kind: "assignee", id: "a", userId: "u1", reason },
  priority: { kind: "priority", id: "p", priority: "high", reason },
  feature: {
    kind: "feature",
    id: "f",
    featureId: "f1",
    milestoneId: "m1",
    reason,
  },
  milestone: { kind: "milestone", id: "m", milestoneId: "m1", reason },
  release: { kind: "release", id: "r", releaseId: "r1", reason },
  estimate: { kind: "estimate", id: "e", minutes: 60, reason },
  bugCases: {
    kind: "test_cases",
    id: "tb",
    target: "bug",
    milestoneId: null,
    cases: [{ title: "A", steps: null, expectedResult: null }],
    reason,
  },
  milestoneCases: {
    kind: "test_cases",
    id: "tm",
    target: "milestone",
    milestoneId: "m1",
    cases: [{ title: "A", steps: null, expectedResult: null }],
    reason,
  },
  describedCases: {
    kind: "description",
    id: "td",
    title: "Test cases",
    markdown: "## Test cases",
    origin: "test_cases",
  },
} satisfies Record<string, ReadinessSuggestion>;

const visibleIds = (
  list: ReadinessSuggestion[],
  overrides: Omit<Partial<SuggestionFacts>, "task"> & {
    task?: Partial<SuggestionFacts["task"]>;
  } = {},
) =>
  visibleSuggestions(list, {
    ...facts,
    ...overrides,
    task: { ...facts.task, ...overrides.task },
  }).map((item) => item.id);

describe("visibleSuggestions", () => {
  it("shows suggestions for empty fields, legacy rows as descriptions", () => {
    const list = [
      suggestions.legacy,
      suggestions.description,
      suggestions.assignee,
      suggestions.priority,
      suggestions.feature,
      suggestions.release,
      suggestions.estimate,
      suggestions.describedCases,
    ];
    expect(visibleIds(list)).toEqual(list.map((item) => item.id));
  });

  it("hides a field once it is set", () => {
    expect(
      visibleIds(
        [
          suggestions.assignee,
          suggestions.priority,
          suggestions.feature,
          suggestions.release,
          suggestions.estimate,
        ],
        {
          task: {
            userId: "u9",
            priority: "low",
            featureId: "f1",
            releaseId: "r9",
            estimateSeconds: 60,
          },
        },
      ),
    ).toEqual([]);
  });

  it("hides dismissed kinds, test cases written for the description too", () => {
    expect(
      visibleIds([suggestions.priority, suggestions.describedCases], {
        dismissedKinds: ["priority", "test_cases"],
      }),
    ).toEqual([]);
  });

  it("hides people who can no longer be assigned", () => {
    expect(
      visibleIds([suggestions.assignee], { assignable: new Map() }),
    ).toEqual([]);
  });

  it("hides features that are gone and milestones outside their feature", () => {
    expect(visibleIds([suggestions.feature], { features: new Map() })).toEqual(
      [],
    );
    expect(visibleIds([{ ...suggestions.feature, milestoneId: "m2" }])).toEqual(
      [],
    );
    expect(visibleIds([{ ...suggestions.feature, milestoneId: null }])).toEqual(
      ["f"],
    );
  });

  it("shows a milestone of the task's current feature only", () => {
    expect(
      visibleIds([suggestions.milestone], { task: { featureId: "f1" } }),
    ).toEqual(["m"]);
    expect(
      visibleIds([suggestions.milestone], { task: { featureId: "f2" } }),
    ).toEqual([]);
    expect(visibleIds([suggestions.milestone])).toEqual([]);
  });

  it("hides releases that are gone", () => {
    expect(visibleIds([suggestions.release], { releases: new Map() })).toEqual(
      [],
    );
  });

  it("hides what the viewer can't read", () => {
    expect(
      visibleIds([suggestions.feature], {
        can: { features: false, milestones: true, testCases: true },
      }),
    ).toEqual([]);
    expect(
      visibleIds([suggestions.feature, suggestions.milestone], {
        task: { featureId: "f1" },
        can: { features: true, milestones: false, testCases: true },
      }),
    ).toEqual([]);
    expect(
      visibleIds([suggestions.bugCases], {
        task: { type: "bug" },
        can: { features: true, milestones: true, testCases: false },
      }),
    ).toEqual([]);
  });

  it("hides test cases once their target has some", () => {
    const bug = { type: "bug" };
    expect(visibleIds([suggestions.bugCases], { task: bug })).toEqual(["tb"]);
    expect(
      visibleIds([suggestions.bugCases], { task: bug, testCases: 1 }),
    ).toEqual([]);
    const inMilestone = { featureId: "f1", milestoneId: "m1" };
    expect(
      visibleIds([suggestions.milestoneCases], { task: inMilestone }),
    ).toEqual(["tm"]);
    expect(
      visibleIds([suggestions.milestoneCases], {
        task: inMilestone,
        testCases: 2,
      }),
    ).toEqual([]);
    expect(
      visibleIds([suggestions.describedCases], {
        task: { description: "## Test cases\n\n1. A" },
      }),
    ).toEqual([]);
  });

  it("hides test cases whose target changed", () => {
    expect(
      visibleIds([suggestions.milestoneCases], {
        task: { featureId: "f1", milestoneId: "m3" },
      }),
    ).toEqual([]);
    expect(visibleIds([suggestions.bugCases])).toEqual([]);
    expect(
      visibleIds([suggestions.describedCases], {
        task: { featureId: "f1", milestoneId: "m1" },
      }),
    ).toEqual([]);
  });
});
