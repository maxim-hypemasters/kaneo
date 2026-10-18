import { useQuery } from "@tanstack/react-query";
import getReleases from "@/fetchers/release/get-releases";
import { compareReleasesByStart } from "@/lib/releases/sort-releases";
import type { Release } from "@/types/release";

export function releasesKey(projectId: string) {
  return ["releases", projectId] as const;
}

// A project's releases with their progress, ordered by start date. Release
// messages refetch them; task messages only mark them stale (see
// useProjectWebSocket). A select that must keep its result between renders,
// such as releaseSummaries, has to be a stable function.
export function useGetReleases<TData = Release[]>(
  projectId: string | undefined,
  {
    enabled = true,
    select,
  }: { enabled?: boolean; select?: (releases: Release[]) => TData } = {},
) {
  return useQuery({
    queryKey: releasesKey(projectId ?? ""),
    queryFn: async () =>
      [...(await getReleases(projectId ?? ""))].sort(compareReleasesByStart),
    enabled: enabled && !!projectId,
    staleTime: 60_000,
    refetchOnMount: true,
    select,
  });
}
