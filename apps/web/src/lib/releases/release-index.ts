import type Task from "@/types/task";

type BoardSnapshot = {
  columns?: ReadonlyArray<{ tasks: readonly Task[] }>;
  plannedTasks?: readonly Task[];
  archivedTasks?: readonly Task[];
};

// Each release's tasks and features, in board order. Archived items are left
// out.
export type ReleaseIndex = ReadonlyMap<string, readonly Task[]>;

const EMPTY: ReleaseIndex = new Map();
const cache = new WeakMap<object, ReleaseIndex>();

// Built once per board snapshot (the query cache hands out a new object on
// every change), like getFeatureIndex. A release and its items always share a
// project, hence a board.
export function getReleaseIndex(
  board: BoardSnapshot | null | undefined,
): ReleaseIndex {
  if (!board) return EMPTY;
  const cached = cache.get(board);
  if (cached) return cached;
  const index = new Map<string, Task[]>();
  const items = [
    ...(board.columns ?? []).flatMap((column) => column.tasks),
    ...(board.plannedTasks ?? []),
  ];
  for (const item of items) {
    if (!item.releaseId || item.status === "archived") continue;
    const releaseItems = index.get(item.releaseId) ?? [];
    releaseItems.push(item);
    index.set(item.releaseId, releaseItems);
  }
  cache.set(board, index);
  return index;
}
