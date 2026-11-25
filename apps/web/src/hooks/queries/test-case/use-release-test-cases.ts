import { useQuery } from "@tanstack/react-query";
import { getReleaseTestCases } from "@/fetchers/test-case/get-release-test-cases";
import { releaseTestCasesKey } from "./test-case-keys";

export function useReleaseTestCases(
  projectId: string,
  releaseId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: releaseTestCasesKey(projectId, releaseId),
    queryFn: () => getReleaseTestCases(releaseId),
    enabled: enabled && Boolean(projectId && releaseId),
  });
}
