import type { QueryClient } from "@tanstack/react-query";
import { invalidateMyWork } from "@/lib/invalidate-my-work";
import { updateBoardTaskCache } from "@/lib/update-board-task-cache";
import type Task from "@/types/task";

// The deciding window gets no socket message for its own change, so it
// moves the task on its board and refreshes what the decision touches.
export function applyTriageResult(queryClient: QueryClient, task: Task) {
  updateBoardTaskCache(queryClient, task.projectId, task.id, task);
  invalidateMyWork(queryClient);
  for (const queryKey of [
    ["task", task.id],
    ["activities", task.id],
    ["release-progress", task.projectId],
    ["feature-milestones", task.projectId],
    ["releases", task.projectId],
    ["projects"],
  ])
    void queryClient.invalidateQueries({ queryKey });
}
