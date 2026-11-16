import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import type { ProjectWithTasks } from "@/types/project";

// Reads a loaded board without fetching one, so sidebars stay cheap.
export function useCachedTriageCount(projectId: string) {
  const queryClient = useQueryClient();
  const subscribe = useCallback(
    (onChange: () => void) =>
      queryClient.getQueryCache().subscribe((event) => {
        const [key, id] = event.query.queryKey;
        if (key === "tasks" && id === projectId) onChange();
      }),
    [queryClient, projectId],
  );
  return useSyncExternalStore(
    subscribe,
    () =>
      queryClient.getQueryData<ProjectWithTasks>(["tasks", projectId])
        ?.triageTasks?.length,
  );
}
