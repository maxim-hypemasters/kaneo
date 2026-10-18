import type { QueryClient } from "@tanstack/react-query";
import { releasesKey } from "@/hooks/queries/release/use-get-releases";

// After tasks or features change release: the board (unless the caller patched
// it), the release list (its progress), the feature list (it carries each
// feature's release) and each task involved; "all" when the ids aren't known,
// as after deleting a release. The window that made the change gets no
// websocket message for it.
export function invalidateReleaseChange(
  queryClient: QueryClient,
  projectId: string,
  taskIds: ReadonlyArray<string | null | undefined> | "all",
  { board = true }: { board?: boolean } = {},
) {
  if (board)
    void queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
  void queryClient.invalidateQueries({ queryKey: releasesKey(projectId) });
  void queryClient.invalidateQueries({
    queryKey: ["project-features", projectId],
  });
  if (taskIds === "all") {
    void queryClient.invalidateQueries({ queryKey: ["task"] });
    void queryClient.invalidateQueries({ queryKey: ["activities"] });
    return;
  }
  for (const id of new Set(taskIds)) {
    if (!id) continue;
    void queryClient.invalidateQueries({ queryKey: ["task", id] });
    void queryClient.invalidateQueries({ queryKey: ["activities", id] });
  }
}
