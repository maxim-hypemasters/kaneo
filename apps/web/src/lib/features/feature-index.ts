import type Task from "@/types/task";

type BoardSnapshot = {
  columns?: ReadonlyArray<{ tasks: readonly Task[] }>;
  plannedTasks?: readonly Task[];
  archivedTasks?: readonly Task[];
};

export type FeatureIndex = {
  // Every feature on the board, planned and archived ones included.
  features: ReadonlyMap<string, Task>;
  // Each feature's tasks, in board order.
  tasksByFeature: ReadonlyMap<string, readonly Task[]>;
};

const EMPTY: FeatureIndex = { features: new Map(), tasksByFeature: new Map() };
const cache = new WeakMap<object, FeatureIndex>();

// Built once per board snapshot (the query cache hands out a new object on
// every change), so cards and rows can look features up without a query of
// their own. A feature and its tasks always share a project, hence a board.
export function getFeatureIndex(board: BoardSnapshot | null | undefined) {
  if (!board) return EMPTY;
  const cached = cache.get(board);
  if (cached) return cached;
  const features = new Map<string, Task>();
  const tasksByFeature = new Map<string, Task[]>();
  const all = [
    ...(board.columns ?? []).flatMap((column) => column.tasks),
    ...(board.plannedTasks ?? []),
    ...(board.archivedTasks ?? []),
  ];
  for (const task of all) {
    if (task.type === "feature") features.set(task.id, task);
    if (task.featureId) {
      const tasks = tasksByFeature.get(task.featureId) ?? [];
      tasks.push(task);
      tasksByFeature.set(task.featureId, tasks);
    }
  }
  const index = { features, tasksByFeature };
  cache.set(board, index);
  return index;
}
