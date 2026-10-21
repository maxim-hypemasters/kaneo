import { invalidateWorkLinkCandidates } from "@/lib/invalidate-work-link-candidates";
import type { QueryClient } from "@tanstack/react-query";
import { releasesKey } from "@/hooks/queries/release/use-get-releases";

// After a task joins or leaves a feature, or changes type: the board (cards,
// chips and the feature's progress), the release list (a task joining a
// feature can take its release) and each task involved. The window that made
// the change gets no websocket message for it.
export function invalidateFeatureChange(
  queryClient: QueryClient,
  projectId: string,
  taskIds: ReadonlyArray<string | null | undefined>,
) {
  invalidateWorkLinkCandidates(queryClient, projectId);
  void queryClient.invalidateQueries({
    queryKey: ["feature-library", projectId],
  });
  void queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
  void queryClient.invalidateQueries({
    queryKey: ["project-features", projectId],
  });
  void queryClient.invalidateQueries({
    queryKey: ["project-task-relations", projectId],
  });
  void queryClient.invalidateQueries({ queryKey: releasesKey(projectId) });
  void queryClient.invalidateQueries({
    queryKey: ["release-progress", projectId],
  });
  void queryClient.invalidateQueries({
    queryKey: ["feature-milestones", projectId],
  });
  void queryClient.invalidateQueries({ queryKey: ["task-relations"] });
  for (const id of new Set(taskIds)) {
    if (!id) continue;
    void queryClient.invalidateQueries({ queryKey: ["task", id] });
    void queryClient.invalidateQueries({ queryKey: ["activities", id] });
  }
}
