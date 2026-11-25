// The latest result of running the test case.
export const TEST_CASE_STATUSES = [
  "not_run",
  "passed",
  "failed",
  "blocked",
] as const;

export type TestCaseStatus = (typeof TEST_CASE_STATUSES)[number];
