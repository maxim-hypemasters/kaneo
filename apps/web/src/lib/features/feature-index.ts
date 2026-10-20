import type Task from "@/types/task";

type BoardSnapshot = {
  columns?: ReadonlyArray<{ tasks: readonly Task[] }>;
  plannedTasks?: readonly Task[];
  archivedTasks?: readonly Task[];
};

export type FeatureIndex = {
  // Active and archived knowledge records from the shared project summary.
  features: ReadonlyMap<string, Task>;
  // Each feature's tasks, in board order.
  tasksByFeature: ReadonlyMap<string, readonly Task[]>;
};

const EMPTY: FeatureIndex = { features: new Map(), tasksByFeature: new Map() };
const cache = new WeakMap<object, FeatureIndex>();
const summaryCache = new WeakMap<
  object,
  { board: BoardSnapshot | null | undefined; index: FeatureIndex }
>();

// Cache each shared summary and board snapshot together so cards reuse the
// same indexes instead of rebuilding them for every mounted row.
type FeatureSummary = {
  id: string;
  title: string;
  number: number | null;
  projectId: string;
  status?: string | null;
  archivedAt?: string | null;
  releaseId?: string | null;
};
export function getFeatureIndex(
  board: BoardSnapshot | null | undefined,
  summaries?: readonly FeatureSummary[],
) {
  if (!board && !summaries) return EMPTY;
  const shared = summaries ? summaryCache.get(summaries) : undefined;
  if (shared && shared.board === board) return shared.index;
  const cached = !summaries && board ? cache.get(board) : undefined;
  if (cached) return cached;
  const features = new Map<string, Task>();
  const tasksByFeature = new Map<string, Task[]>();
  const all = [
    ...(board?.columns ?? []).flatMap((column) => column.tasks),
    ...(board?.plannedTasks ?? []),
    ...(board?.archivedTasks ?? []),
  ];
  for (const task of all) {
    if (task.type === "feature" && !summaries) features.set(task.id, task);
    if (task.featureId) {
      const tasks = tasksByFeature.get(task.featureId) ?? [];
      tasks.push(task);
      tasksByFeature.set(task.featureId, tasks);
    }
  }
  for (const summary of summaries ?? []) {
    features.set(summary.id, {
      description: null,
      priority: null,
      startDate: null,
      dueDate: null,
      position: null,
      createdAt: "",
      userId: null,
      assigneeId: null,
      assigneeName: null,
      ...summary,
      type: "feature",
      status: null,
      releaseId: null,
    });
  }
  const index = { features, tasksByFeature };
  if (board && !summaries) cache.set(board, index);
  if (summaries) summaryCache.set(summaries, { board, index });
  return index;
}
