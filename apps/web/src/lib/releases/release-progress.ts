import type Task from "@/types/task";

export type ReleaseItemCounts = {
  tasks: number;
  completedTasks: number;
  features: number;
  completedFeatures: number;
  // Neither archived nor in a final column: what Move unfinished moves.
  unfinished: number;
};

// The statuses (column slugs) that count as done.
export function finalStatuses(
  columns: ReadonlyArray<{ slug: string; isFinal: boolean }>,
): ReadonlySet<string> {
  return new Set(
    columns.filter((column) => column.isFinal).map((column) => column.slug),
  );
}

// The API's progress rule, over the items given: archived items count in the
// totals but are never unfinished.
export function releaseProgress(
  items: ReadonlyArray<Pick<Task, "type" | "status">>,
  doneStatuses: ReadonlySet<string>,
): ReleaseItemCounts {
  const counts: ReleaseItemCounts = {
    tasks: 0,
    completedTasks: 0,
    features: 0,
    completedFeatures: 0,
    unfinished: 0,
  };
  for (const item of items) {
    const completed = doneStatuses.has(item.status);
    if (item.type === "feature") {
      counts.features += 1;
      if (completed) counts.completedFeatures += 1;
    } else {
      counts.tasks += 1;
      if (completed) counts.completedTasks += 1;
    }
    if (!completed && item.status !== "archived") counts.unfinished += 1;
  }
  return counts;
}
