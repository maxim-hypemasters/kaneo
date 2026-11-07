import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getFeatureIssues } from "@/fetchers/feature/get-feature-issues";
import { featureWorkspaceKey } from "./use-feature-workspace";

export function useFeatureIssues(
  projectId: string,
  featureId: string,
  options: Parameters<typeof getFeatureIssues>[1],
) {
  return useQuery({
    queryKey: [...featureWorkspaceKey(projectId, featureId), "issues", options],
    queryFn: ({ signal }) => getFeatureIssues(featureId, options, signal),
    enabled: Boolean(projectId && featureId),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
