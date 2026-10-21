import { useQuery } from "@tanstack/react-query";
import getReleaseLinkCandidates, {
  type ReleaseLinkKind,
} from "@/fetchers/release/get-release-link-candidates";

export function useReleaseLinkCandidates(
  projectId: string,
  releaseId: string,
  kind: ReleaseLinkKind,
  search: string,
  page: number,
  enabled: boolean,
) {
  const query = search.trim();
  return useQuery({
    queryKey: [
      "release-link-candidates",
      projectId,
      releaseId,
      kind,
      query,
      page,
    ],
    queryFn: ({ signal }) =>
      getReleaseLinkCandidates(releaseId, kind, query, page, signal),
    enabled: Boolean(enabled && projectId && releaseId),
    staleTime: 30_000,
    refetchOnMount: true,
  });
}
