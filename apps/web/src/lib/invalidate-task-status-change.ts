import type { QueryClient } from "@tanstack/react-query";
import { invalidateMyWork } from "@/lib/invalidate-my-work";
import { invalidateWorkLinkCandidates } from "@/lib/invalidate-work-link-candidates";

/** Refreshes everything that shows a task's status after it changed. */
export function invalidateTaskStatusChange(
  queryClient: QueryClient,
  task: { id: string; projectId: string },
) {
  invalidateWorkLinkCandidates(queryClient, task.projectId);
  invalidateMyWork(queryClient);
  for (const queryKey of [
    ["release-progress", task.projectId],
    ["feature-milestones", task.projectId],
    ["releases", task.projectId],
    ["task", task.id],
    ["tasks", task.projectId],
    ["notifications"],
    ["projects"],
    ["activities", task.id],
    ["task-relations"],
  ]) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
