import type { TestCaseStatus } from "@/fetchers/test-case/types";

export const TEST_CASE_STATUSES: readonly TestCaseStatus[] = [
  "not_run",
  "passed",
  "failed",
  "blocked",
];

export const TEST_CASE_STATUS_LABELS: Record<TestCaseStatus, string> = {
  not_run: "tasks:testCases.status.not_run",
  passed: "tasks:testCases.status.passed",
  failed: "tasks:testCases.status.failed",
  blocked: "tasks:testCases.status.blocked",
};

export const TEST_CASE_STATUS_BADGES = {
  not_run: "outline",
  passed: "success",
  failed: "error",
  blocked: "warning",
} as const satisfies Record<TestCaseStatus, string>;

export function isTestCaseStatus(value: unknown): value is TestCaseStatus {
  return TEST_CASE_STATUSES.includes(value as TestCaseStatus);
}
