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
