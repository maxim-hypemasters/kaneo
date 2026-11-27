import { describe, expect, it } from "vite-plus/test";
import {
  type MissingFieldsTask,
  missingFields,
  testCaseTarget,
} from "./missing-fields";

const empty: MissingFieldsTask = {
  type: "task",
  userId: null,
  priority: "no-priority",
  featureId: null,
  milestoneId: null,
  releaseId: null,
  estimateSeconds: null,
  description: "",
};
const candidates = {
  hasFeatures: true,
  featureHasMilestones: true,
  hasReleases: true,
  testCases: 0,
};

describe("missingFields", () => {
  it("lists every empty field that has candidates", () => {
    expect(missingFields({ task: empty, ...candidates })).toEqual([
      "assignee",
      "priority",
      "feature",
      "release",
      "estimate",
      "test_cases",
    ]);
  });

  it("counts no-priority as missing and any other priority as set", () => {
    const missing = (priority: string) =>
      missingFields({ task: { ...empty, priority }, ...candidates });
    expect(missing("no-priority")).toContain("priority");
    expect(missing("low")).not.toContain("priority");
  });

  it("leaves out fields that are set", () => {
    expect(
      missingFields({
        task: {
          ...empty,
          userId: "u1",
          priority: "high",
          featureId: "f1",
          milestoneId: "m1",
          releaseId: "r1",
          estimateSeconds: 3600,
        },
        ...candidates,
        testCases: 2,
      }),
    ).toEqual([]);
  });

  it("leaves out fields with nothing to choose from", () => {
    const missing = missingFields({
      task: { ...empty, priority: "low" },
      hasFeatures: false,
      featureHasMilestones: false,
      hasReleases: false,
      testCases: 0,
    });
    expect(missing).toEqual(["assignee", "estimate", "test_cases"]);
  });

  it("asks for a milestone only inside a feature that has milestones", () => {
    const inFeature = { ...empty, featureId: "f1" };
    expect(missingFields({ task: inFeature, ...candidates })).toContain(
      "milestone",
    );
    expect(
      missingFields({
        task: inFeature,
        ...candidates,
        featureHasMilestones: false,
      }),
    ).not.toContain("milestone");
    expect(missingFields({ task: empty, ...candidates })).not.toContain(
      "milestone",
    );
  });

  it("judges test cases by where they belong", () => {
    const has = (task: MissingFieldsTask, testCases: number) =>
      !missingFields({ task, ...candidates, testCases }).includes("test_cases");
    const bug = { ...empty, type: "bug" };
    expect(has(bug, 0)).toBe(false);
    expect(has(bug, 1)).toBe(true);
    const inMilestone = { ...empty, featureId: "f1", milestoneId: "m1" };
    expect(has(inMilestone, 0)).toBe(false);
    expect(has(inMilestone, 3)).toBe(true);
    // A plain task has them once its description has the heading.
    expect(has(empty, 5)).toBe(false);
    expect(has({ ...empty, description: "Do it.\n\n## Test cases" }, 0)).toBe(
      true,
    );
  });
});

describe("testCaseTarget", () => {
  it("prefers the bug, then the milestone, then the description", () => {
    expect(testCaseTarget({ type: "bug", milestoneId: "m1" })).toBe("bug");
    expect(testCaseTarget({ type: "task", milestoneId: "m1" })).toBe(
      "milestone",
    );
    expect(testCaseTarget({ type: "task", milestoneId: null })).toBe(
      "description",
    );
  });
});
