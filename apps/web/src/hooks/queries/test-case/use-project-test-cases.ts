import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getProjectTestCases } from "@/fetchers/test-case/get-project-test-cases";
import type { TestCaseListQuery } from "@/fetchers/test-case/types";
import { projectTestCasesKey } from "./test-case-keys";

export function useProjectTestCases(
  projectId: string,
  query: TestCaseListQuery,
  enabled = true,
) {
  return useQuery({
    queryKey: projectTestCasesKey(projectId, query),
    queryFn: () => getProjectTestCases(projectId, query),
    enabled: enabled && Boolean(projectId),
    placeholderData: keepPreviousData,
  });
}
