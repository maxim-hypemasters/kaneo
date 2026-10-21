import { useQuery } from "@tanstack/react-query";
import getFeatureLinkCandidates from "@/fetchers/task/get-feature-link-candidates";

export function useFeatureLinkCandidates(
  projectId: string,
  search: string,
  page: number,
  enabled: boolean,
) {
  const query = search.trim();
  return useQuery({
    queryKey: ["feature-create-candidates", projectId, query, page],
    queryFn: ({ signal }) =>
      getFeatureLinkCandidates(projectId, query, page, signal),
    enabled: Boolean(enabled && projectId),
    staleTime: 30_000,
    refetchOnMount: true,
  });
}
