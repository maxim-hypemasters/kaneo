import { useQuery } from "@tanstack/react-query";
import getReleases from "@/fetchers/release/get-releases";
import { compareReleasesByStart } from "@/lib/releases/sort-releases";
import type { Release } from "@/types/release";

export function releasesKey(projectId: string) {
  return ["releases", projectId] as const;
}

// A project's releases with their progress, ordered by start date. Release
// and task/workflow messages refetch them through a coalesced refresh (see
// useProjectWebSocket). A select that must keep its result between renders,
// such as releaseSummaries, has to be a stable function.
export function useGetReleases<TData = Release[]>(
  projectId: string | undefined,
  {
    enabled = true,
    select,
    refetchOnMount = true,
  }: {
    enabled?: boolean;
    select?: (releases: Release[]) => TData;
    refetchOnMount?: boolean | "always";
  } = {},
) {
  return useQuery({
    queryKey: releasesKey(projectId ?? ""),
    queryFn: async () =>
      [...(await getReleases(projectId ?? ""))].sort(compareReleasesByStart),
    enabled: enabled && !!projectId,
    staleTime: 60_000,
    refetchOnMount,
    select,
  });
}
