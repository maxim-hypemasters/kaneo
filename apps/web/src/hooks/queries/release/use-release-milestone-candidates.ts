import { useQuery } from "@tanstack/react-query";
import getReleaseMilestoneCandidates from "@/fetchers/release/get-release-milestone-candidates";

export function useReleaseMilestoneCandidates(
  projectId: string,
  search: string,
  page: number,
  enabled: boolean,
) {
  const query = search.trim();
  return useQuery({
    queryKey: [
      "release-link-candidates",
      projectId,
      "create",
      "milestone",
      query,
      page,
    ],
    queryFn: ({ signal }) =>
      getReleaseMilestoneCandidates(projectId, query, page, signal),
    enabled: Boolean(enabled && projectId),
    staleTime: 30_000,
    refetchOnMount: true,
  });
}
