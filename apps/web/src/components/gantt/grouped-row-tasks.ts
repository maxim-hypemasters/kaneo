type RowTask = {
  id: string;
  type?: string;
  featureId?: string | null;
};

const NO_IDS: ReadonlySet<string> = new Set();

// The tasks that get a row of their own when the chart is grouped by
// assignee. A feature with any of its tasks among `tasks` shows as slices on
// those tasks' members' lines instead; one without (its tasks undated or
// filtered out) keeps its row so it never disappears. So does a feature in
// `keepIds` (one in a blocks dependency): arrows and the early-start warning
// attach to rows, and slices span its tasks rather than its own dates.
export function groupedRowTasks<T extends RowTask>(
  tasks: readonly T[],
  keepIds: ReadonlySet<string> = NO_IDS,
): T[] {
  const featuresWithTasks = new Set<string>();
  for (const task of tasks) {
    if (task.featureId && task.type !== "feature") {
      featuresWithTasks.add(task.featureId);
    }
  }
  return tasks.filter(
    (task) =>
      task.type !== "feature" ||
      !featuresWithTasks.has(task.id) ||
      keepIds.has(task.id),
  );
}
