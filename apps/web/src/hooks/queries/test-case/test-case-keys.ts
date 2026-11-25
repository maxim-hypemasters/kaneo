import type { TestCaseListQuery } from "@/fetchers/test-case/types";

// Every test case query of a project sits under one prefix, so a change
// refreshes the project page, the Feature and release lists, and sections.
export const testCasesKey = (projectId: string) =>
  ["test-cases", projectId] as const;

export const projectTestCasesKey = (
  projectId: string,
  query: TestCaseListQuery,
) => [...testCasesKey(projectId), "project", query] as const;

export const featureTestCasesKey = (projectId: string, featureId: string) =>
  [...testCasesKey(projectId), "feature", featureId] as const;

export const releaseTestCasesKey = (projectId: string, releaseId: string) =>
  [...testCasesKey(projectId), "release", releaseId] as const;

export const testCaseKey = (projectId: string, id: string) =>
  [...testCasesKey(projectId), "detail", id] as const;

// Comment threads sit outside the test cases prefix: task and milestone
// messages refresh every test case list, and an open thread has no reason to
// refetch with them. The project id lets losing access to it evict them.
export const testCaseCommentThreadsKey = (projectId: string) =>
  ["test-case-comments", projectId] as const;

export const testCaseCommentsKey = (projectId: string, testCaseId: string) =>
  [...testCaseCommentThreadsKey(projectId), testCaseId] as const;
