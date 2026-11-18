import type { TestCaseSummary } from "@/fetchers/test-case/types";

export type TestCaseGroup = {
  key: string;
  kind: "milestone" | "bug";
  // Null when the caller can't read the milestone or bug.
  title: string | null;
  testCases: TestCaseSummary[];
};

type Source = Omit<TestCaseGroup, "testCases">;

function milestoneSource(testCase: TestCaseSummary): Source | null {
  if (!testCase.milestoneId) return null;
  return {
    key: `milestone:${testCase.milestoneId}`,
    kind: "milestone",
    title: testCase.milestone?.title ?? null,
  };
}

function bugSource(testCase: TestCaseSummary): Source | null {
  if (!testCase.bugId) return null;
  const bug = testCase.bug;
  return {
    key: `bug:${testCase.bugId}`,
    kind: "bug",
    title: bug
      ? bug.number === null
        ? bug.title
        : `#${bug.number} ${bug.title}`
      : null,
  };
}

function group(
  testCases: readonly TestCaseSummary[],
  sourceOf: (testCase: TestCaseSummary) => Source | null,
) {
  const groups = new Map<string, TestCaseGroup>();
  for (const testCase of testCases) {
    const source = sourceOf(testCase);
    if (!source) continue;
    const existing = groups.get(source.key);
    if (existing) existing.testCases.push(testCase);
    else groups.set(source.key, { ...source, testCases: [testCase] });
  }
  return [...groups.values()];
}

// A Feature's test cases arrive in milestone order; keep it.
export function groupByMilestone(testCases: readonly TestCaseSummary[]) {
  return group(testCases, milestoneSource);
}

// On a release, a test case sits under its milestone when the milestone is
// planned for the release, and otherwise under its bug.
export function groupByReleaseSource(
  testCases: readonly TestCaseSummary[],
  releaseId: string,
) {
  return group(testCases, (testCase) => {
    const milestone = milestoneSource(testCase);
    const bug = bugSource(testCase);
    if (milestone && testCase.milestone?.releaseId === releaseId)
      return milestone;
    if (bug && testCase.bug?.releaseId === releaseId) return bug;
    return milestone ?? bug;
  });
}
