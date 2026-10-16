import type { QueryClient } from "@tanstack/react-query";
import type { ProjectWithTasks } from "@/types/project";
import type Task from "@/types/task";

// The feature a task belongs to, from its cached detail or any cached board;
// null when none is known.
export function findCachedFeatureId(
  queryClient: QueryClient,
  taskId: string,
): string | null {
  const detail = queryClient.getQueryData<Pick<Task, "featureId">>([
    "task",
    taskId,
  ]);
  if (detail?.featureId !== undefined) return detail.featureId;
  for (const [, board] of queryClient.getQueriesData<ProjectWithTasks>({
    queryKey: ["tasks"],
  })) {
    if (!Array.isArray(board?.columns)) continue;
    const task = [
      ...board.columns.flatMap((column) => column.tasks),
      ...(board.plannedTasks ?? []),
      ...(board.archivedTasks ?? []),
    ].find((task) => task.id === taskId);
    if (task) return task.featureId ?? null;
  }
  return null;
}
