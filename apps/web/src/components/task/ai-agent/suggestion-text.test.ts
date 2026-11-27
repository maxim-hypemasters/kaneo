import { beforeAll, describe, expect, it } from "vite-plus/test";
import { i18n, preloadNamespaces } from "@/lib/i18n";
import {
  estimateSuggestion,
  featureSuggestion,
  testCasesSuggestion,
} from "./suggestion-fixtures";
import {
  estimatePlanText,
  estimateText,
  fieldSuggestionText,
  testCasesText,
} from "./suggestion-text";

// The real en-US copy, so a key that stops passing a value shows up here.
beforeAll(async () => {
  await i18n.changeLanguage("en-US");
  await preloadNamespaces("en-US");
});

const t = i18n.getFixedT("en-US");

describe("fieldSuggestionText", () => {
  it("names the person, priority, feature, milestone and release", () => {
    expect(
      fieldSuggestionText(
        {
          kind: "assignee",
          id: "s",
          reason: "",
          user: { id: "u", name: "Alice" },
        },
        t,
      ),
    ).toBe("Assign to Alice");
    expect(
      fieldSuggestionText(
        { kind: "priority", id: "s", reason: "", priority: "high" },
        t,
      ),
    ).toBe("Set priority: High");
    expect(
      fieldSuggestionText(
        {
          kind: "milestone",
          id: "s",
          reason: "",
          milestone: { id: "m", title: "Beta" },
        },
        t,
      ),
    ).toBe("Milestone: Beta");
    expect(
      fieldSuggestionText(
        {
          kind: "release",
          id: "s",
          reason: "",
          release: { id: "r", name: "2.0", submissionDate: "2026-12-15" },
        },
        t,
      ),
    ).toBe("Release: 2.0");
  });

  it("shows the milestone set together with a feature", () => {
    if (featureSuggestion.kind !== "feature") throw new Error("fixture");
    expect(fieldSuggestionText(featureSuggestion, t)).toBe(
      "Feature: Data export › CSV",
    );
    expect(
      fieldSuggestionText({ ...featureSuggestion, milestone: null }, t),
    ).toBe("Feature: Data export");
  });
});

describe("estimateText", () => {
  it("writes the effort like the Estimate field", () => {
    expect(estimateText(estimateSuggestion({ minutes: 960 }), t)).toBe(
      "Estimate 2d",
    );
    expect(estimateText(estimateSuggestion({ minutes: 90 }), t)).toBe(
      "Estimate 1h 30m",
    );
  });
});

describe("estimatePlanText", () => {
  it("gives the planned dates and for whom", () => {
    expect(estimatePlanText(estimateSuggestion(), t)).toBe(
      "Planned Dec 1 – Dec 3 for Alice",
    );
  });

  it("says Apply also assigns the suggested person", () => {
    const suggestion = estimateSuggestion();
    if (!suggestion.plan) throw new Error("fixture");
    expect(
      estimatePlanText(
        {
          ...suggestion,
          plan: { ...suggestion.plan, suggestedAssignee: true },
        },
        t,
      ),
    ).toBe("Assigns Alice, planned Dec 1 – Dec 3");
  });

  it("says when Apply keeps the dates or sets none", () => {
    expect(
      estimatePlanText(estimateSuggestion({ plan: null, keepsDates: true }), t),
    ).toBe("Keeps the task's current dates");
    expect(estimatePlanText(estimateSuggestion({ plan: null }), t)).toBe(
      "Sets the estimate only, no dates",
    );
  });
});

describe("testCasesText", () => {
  it("counts the cases and names where they go", () => {
    expect(testCasesText(testCasesSuggestion(), t)).toBe(
      "Create 2 test cases for this bug",
    );
    expect(
      testCasesText(
        testCasesSuggestion({
          target: "milestone",
          milestone: { id: "m", title: "Beta" },
          cases: [{ title: "One", steps: null, expectedResult: null }],
        }),
        t,
      ),
    ).toBe("Create 1 test case in Beta");
  });
});
