import { useQuery } from "@tanstack/react-query";
import { getFeatureTestCases } from "@/fetchers/test-case/get-feature-test-cases";
import { featureTestCasesKey } from "./test-case-keys";

export function useFeatureTestCases(
  projectId: string,
  featureId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: featureTestCasesKey(projectId, featureId),
    queryFn: () => getFeatureTestCases(featureId),
    enabled: enabled && Boolean(projectId && featureId),
  });
}
