import { describe, expect, it } from "vite-plus/test";
import type { TestCaseSummary } from "@/fetchers/test-case/types";
import { groupByMilestone, groupByReleaseSource } from "./group-test-cases";

let next = 0;
function testCase(values: Partial<TestCaseSummary> = {}): TestCaseSummary {
  next += 1;
  return {
    id: `tc-${next}`,
    projectId: "p",
    title: `Case ${next}`,
    status: "not_run",
    milestoneId: null,
    bugId: null,
    milestone: null,
    bug: null,
    createdBy: null,
    createdAt: "2026-11-18T00:00:00.000Z",
    updatedAt: "2026-11-18T00:00:00.000Z",
    ...values,
  };
}
const milestone = (id: string, releaseId: string | null = null) => ({
  milestoneId: id,
  milestone: {
    id,
    title: `Milestone ${id}`,
    featureId: "f",
    featureTitle: "Feature",
    releaseId,
  },
});
const bug = (id: string, releaseId: string | null = null) => ({
  bugId: id,
  bug: {
    id,
    number: 7,
    title: "Crash",
    type: "bug" as const,
    status: "to-do",
    releaseId,
  },
});

describe("groupByMilestone", () => {
  it("keeps milestone order and skips unlinked test cases", () => {
    const groups = groupByMilestone([
      testCase(milestone("b")),
      testCase(milestone("a")),
      testCase(milestone("b")),
      testCase(),
    ]);
    expect(
      groups.map((group) => [group.title, group.testCases.length]),
    ).toEqual([
      ["Milestone b", 2],
      ["Milestone a", 1],
    ]);
  });

  it("keeps a group for a milestone the caller can't read", () => {
    const [group] = groupByMilestone([testCase({ milestoneId: "hidden" })]);
    expect(group).toMatchObject({ key: "milestone:hidden", title: null });
  });
});

describe("groupByReleaseSource", () => {
  it("prefers a milestone planned for the release, then the release's bug", () => {
    const groups = groupByReleaseSource(
      [
        testCase({ ...milestone("m", "r"), ...bug("b", "r") }),
        testCase({ ...milestone("other", "later"), ...bug("b", "r") }),
        testCase(bug("b", "r")),
      ],
      "r",
    );
    expect(
      groups.map((group) => [group.kind, group.title, group.testCases.length]),
    ).toEqual([
      ["milestone", "Milestone m", 1],
      ["bug", "#7 Crash", 2],
    ]);
  });
});
