import { describe, expect, it } from "vite-plus/test";
import type { PlanningContext } from "../../agent-runner/response";
import { parseMentionIds } from "../../utils/parse-mentions";
import { toStoredSuggestions } from "./to-stored-suggestions";

const planning: PlanningContext = {
  missing: [
    "assignee",
    "priority",
    "feature",
    "release",
    "estimate",
    "test_cases",
  ],
  estimateDayMinutes: 480,
  people: [{ id: "u1", name: "Ada", openTasks: 2 }],
  features: [
    { id: "f1", title: "Login", milestones: [{ id: "m1", title: "Beta" }] },
  ],
  releases: [{ id: "r1", name: "1.0", submissionDate: "2027-01-01" }],
  testCaseTarget: "bug",
};

const cases = [
  { title: "Signs in", steps: "Submit", expectedResult: "Dashboard" },
];

const everything = {
  assignee: { userId: "u1", reason: "Owns login" },
  priority: { priority: "high" as const, reason: "Blocks sign-in" },
  feature: { featureId: "f1", milestoneId: "m1", reason: "Login work" },
  release: { releaseId: "r1", reason: "Next release" },
  estimate: { minutes: 240, reason: "Half a day" },
  testCases: { cases, reason: "Covers the repro" },
};

function stored(overrides: Partial<Parameters<typeof toStoredSuggestions>[0]>) {
  let next = 0;
  return toStoredSuggestions({
    suggestions: [],
    recommendations: {},
    planning,
    dismissedKinds: [],
    task: { featureId: null, milestoneId: null },
    newId: () => `s${++next}`,
    ...overrides,
  });
}

describe("toStoredSuggestions", () => {
  it("keeps one suggestion per missing field, then the description ones", () => {
    expect(
      stored({
        recommendations: everything,
        suggestions: [{ title: "Expected", markdown: "Expected: signed in." }],
      }),
    ).toEqual([
      { kind: "assignee", id: "s1", userId: "u1", reason: "Owns login" },
      {
        kind: "priority",
        id: "s2",
        priority: "high",
        reason: "Blocks sign-in",
      },
      {
        kind: "feature",
        id: "s3",
        featureId: "f1",
        milestoneId: "m1",
        reason: "Login work",
      },
      { kind: "release", id: "s4", releaseId: "r1", reason: "Next release" },
      { kind: "estimate", id: "s5", minutes: 240, reason: "Half a day" },
      {
        kind: "test_cases",
        id: "s6",
        target: "bug",
        milestoneId: null,
        cases,
        reason: "Covers the repro",
      },
      {
        kind: "description",
        id: "s7",
        title: "Expected",
        markdown: "Expected: signed in.",
      },
    ]);
  });

  it("drops ids that were not among the candidates", () => {
    const kinds = stored({
      recommendations: {
        assignee: { userId: "someone-else", reason: "r" },
        feature: { featureId: "f-gone", reason: "r" },
        release: { releaseId: "r-gone", reason: "r" },
        milestone: { milestoneId: "m1", reason: "r" },
      },
    }).map((item) => item.kind);
    expect(kinds).toEqual([]);
  });

  it("keeps a feature but drops a milestone of another feature", () => {
    expect(
      stored({
        recommendations: {
          feature: { featureId: "f1", milestoneId: "m9", reason: "r" },
        },
      }),
    ).toMatchObject([{ kind: "feature", featureId: "f1", milestoneId: null }]);
  });

  it("drops dismissed kinds and fields that are no longer missing", () => {
    const kinds = stored({
      recommendations: everything,
      planning: { ...planning, missing: ["priority", "estimate"] },
      dismissedKinds: ["estimate"],
    }).map((item) => item.kind);
    expect(kinds).toEqual(["priority"]);
  });

  it("checks a milestone against the task's feature", () => {
    const withMilestone = (featureId: string | null) =>
      stored({
        recommendations: { milestone: { milestoneId: "m1", reason: "r" } },
        planning: { ...planning, missing: ["milestone"] },
        task: { featureId, milestoneId: null },
      });
    expect(withMilestone("f1")).toMatchObject([
      { kind: "milestone", milestoneId: "m1" },
    ]);
    expect(withMilestone("f2")).toEqual([]);
  });

  it("routes test cases to the bug, the milestone or the description", () => {
    const routed = (
      target: PlanningContext["testCaseTarget"],
      milestoneId: string | null = null,
    ) =>
      stored({
        recommendations: { testCases: { cases } },
        planning: { ...planning, testCaseTarget: target },
        task: { featureId: "f1", milestoneId },
      });
    expect(routed("bug")).toMatchObject([
      { kind: "test_cases", target: "bug", milestoneId: null, reason: "" },
    ]);
    expect(routed("milestone", "m1")).toMatchObject([
      { kind: "test_cases", target: "milestone", milestoneId: "m1" },
    ]);
    expect(routed("description")).toEqual([
      {
        kind: "description",
        id: "s1",
        title: "Test cases",
        markdown:
          "## Test cases\n\n### 1. Signs in\n\n**Steps**\n\nSubmit\n\n**Expected result**\n\nDashboard",
        origin: "test_cases",
      },
    ]);
    expect(routed(null)).toEqual([]);
  });

  it("keeps only the description suggestions without a planning context", () => {
    expect(
      stored({
        recommendations: everything,
        planning: null,
        suggestions: [{ title: "Expected", markdown: "Signed in." }],
      }).map((item) => item.kind),
    ).toEqual(["description"]);
  });

  it("strips mention tags from everything the model wrote", () => {
    const mention = '<kaneo-mention id="u2" label="Bo"></kaneo-mention>';
    const result = stored({
      recommendations: {
        priority: { priority: "low", reason: `Ask ${mention} first` },
        testCases: {
          cases: [
            {
              title: `Ping ${mention}`,
              steps: '<kaneo-mention id="u2">',
              expectedResult: `<kaneo-<kaneo-mention>mention id="u2"> done`,
            },
            { title: '<kaneo-mention id="u2"></kaneo-mention>' },
          ],
          reason: mention,
        },
      },
      suggestions: [
        { title: "Notify", markdown: `cc ${mention}` },
        { title: mention, markdown: "Only a mention in the title" },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("kaneo-mention");
    expect(result).toMatchObject([
      { kind: "priority", reason: "Ask Bo first" },
      {
        kind: "test_cases",
        reason: "Bo",
        cases: [{ title: "Ping Bo", steps: null, expectedResult: "done" }],
      },
      { kind: "description", title: "Notify", markdown: "cc Bo" },
      { kind: "description", title: "Bo" },
    ]);
  });

  it("strips every tag the mention parser reads, not only exact ones", () => {
    const tags = [
      '<kaneo-mentionx id="u">',
      '<kaneo-mention_ id="u">',
      '<kaneo-mention2 id="u" label="B">',
      '<KANEO-MENTION id="u">',
    ];
    for (const tag of tags) expect(parseMentionIds(tag)).toEqual(["u"]);
    const result = stored({
      recommendations: {
        priority: { priority: "low", reason: `Ask ${tags[2]}` },
        testCases: {
          cases: tags.map((tag) => ({ title: `Ping ${tag}`, steps: tag })),
        },
      },
      planning: { ...planning, testCaseTarget: "description" },
      suggestions: tags.map((tag) => ({ title: "cc", markdown: `cc ${tag}` })),
    });
    expect(JSON.stringify(result).toLowerCase()).not.toContain("kaneo-mention");
    // Description suggestions are what Apply writes into the description.
    for (const item of result)
      if (item.kind === "description")
        expect(parseMentionIds(item.markdown)).toEqual([]);
    expect(result).toMatchObject([
      { kind: "priority", reason: "Ask B" },
      { kind: "description", markdown: "cc" },
      { kind: "description", markdown: "cc" },
      { kind: "description", markdown: "cc B" },
      { kind: "description", markdown: "cc" },
      { kind: "description", origin: "test_cases" },
    ]);
  });
});
