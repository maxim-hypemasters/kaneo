import { getReleaseIndex } from "@/lib/releases/release-index";
import {
  finalStatuses,
  type ReleaseItemCounts,
  releaseProgress,
} from "@/lib/releases/release-progress";
import type { Release } from "@/types/release";
import type Task from "@/types/task";

export type CountsBoard = {
  columns: ReadonlyArray<{ slug: string; isFinal: boolean; tasks: Task[] }>;
  plannedTasks: Task[];
  archivedTasks: Task[];
};

type BoardState<T> = {
  data?: T;
  dataUpdatedAt: number;
  isInvalidated: boolean;
};

export function countsFromProgress(
  progress: Release["progress"],
): ReleaseItemCounts {
  return {
    tasks: progress.tasks.total,
    completedTasks: progress.tasks.completed,
    features: progress.features.total,
    completedFeatures: progress.features.completed,
    unfinished: progress.unfinished,
  };
}

// The cached board counts only while it's current and at least as recent as
// the release list: an invalidated board waits for a refetch that may never
// come without a board on screen, and one left from an earlier visit is older
// than the list fetched on arrival.
export function liveBoard<T>(
  board: BoardState<T> | undefined,
  releasesUpdatedAt: number,
): T | undefined {
  if (!board?.data || board.isInvalidated) return undefined;
  return board.dataUpdatedAt >= releasesUpdatedAt ? board.data : undefined;
}

// Each release's counts: from the board when there is one, so changes made in
// this window show at once, otherwise from the API. Archived items count in
// the totals, as the API counts them.
export function countReleaseItems(
  releases: ReadonlyArray<Pick<Release, "id" | "progress">>,
  board: CountsBoard | undefined,
): ReadonlyMap<string, ReleaseItemCounts> {
  const counts = new Map<string, ReleaseItemCounts>();
  if (!board) {
    for (const release of releases) {
      counts.set(release.id, countsFromProgress(release.progress));
    }
    return counts;
  }
  const index = getReleaseIndex(board);
  const done = finalStatuses(board.columns);
  const archived = new Map<string, Task[]>();
  for (const task of board.archivedTasks) {
    if (!task.releaseId) continue;
    const items = archived.get(task.releaseId);
    if (items) items.push(task);
    else archived.set(task.releaseId, [task]);
  }
  for (const release of releases) {
    counts.set(
      release.id,
      releaseProgress(
        [...(index.get(release.id) ?? []), ...(archived.get(release.id) ?? [])],
        done,
      ),
    );
  }
  return counts;
}
