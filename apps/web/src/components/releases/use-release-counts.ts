import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { releasesKey } from "@/hooks/queries/release/use-get-releases";
import type { Release } from "@/types/release";
import type { ProjectWithTasks } from "@/types/project";
import { countReleaseItems, liveBoard } from "./release-counts";

// Release counts for the given releases, live from the cached board when it is
// current (see liveBoard), otherwise the API's progress. Reads the board
// without a query observer of its own, like useCachedBoard: the Releases pages
// load it, as task messages only mark the release list stale.
export function useReleaseCounts(
  projectId: string,
  releases: readonly Release[],
) {
  const queryClient = useQueryClient();
  const subscribe = useCallback(
    (onChange: () => void) =>
      queryClient.getQueryCache().subscribe(({ query }) => {
        const [scope, id] = query.queryKey;
        if (id === projectId && (scope === "tasks" || scope === "releases"))
          onChange();
      }),
    [queryClient, projectId],
  );
  const getSnapshot = () => {
    const state = queryClient.getQueryState<ProjectWithTasks>([
      "tasks",
      projectId,
    ]);
    return liveBoard(
      // A board being refetched stays live until the refetch lands: the list
      // it would fall back to is usually older.
      state && {
        ...state,
        isInvalidated: state.isInvalidated && state.fetchStatus !== "fetching",
      },
      queryClient.getQueryState(releasesKey(projectId))?.dataUpdatedAt ?? 0,
    );
  };
  const board = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(() => countReleaseItems(releases, board), [releases, board]);
}
