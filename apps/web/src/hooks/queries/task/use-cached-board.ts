import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import type { ProjectWithTasks } from "@/types/project";

// Reads part of the project's cached board without a query observer of its
// own: a reader observer would replace the board query's fetcher, and a card
// re-rendering on every board change would slow big boards. `select` must
// return the same value until the part it reads changes.
export function useCachedBoard<T>(
  projectId: string | undefined,
  select: (board: ProjectWithTasks | undefined) => T,
): T {
  const queryClient = useQueryClient();
  const subscribe = useCallback(
    (onChange: () => void) =>
      queryClient.getQueryCache().subscribe(({ query }) => {
        if (query.queryKey[0] === "tasks" && query.queryKey[1] === projectId)
          onChange();
      }),
    [queryClient, projectId],
  );
  const getSnapshot = () =>
    select(queryClient.getQueryData<ProjectWithTasks>(["tasks", projectId]));
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
