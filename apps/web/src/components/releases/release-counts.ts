import { type ReleaseItemCounts } from "@/lib/releases/release-progress";
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
    completedFeatures: 0,
    milestones: progress.milestones?.total ?? 0,
    completedMilestones: progress.milestones?.completed ?? 0,
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

// The board excludes Milestones, so complete release totals come from the API.
export function countReleaseItems(
  releases: ReadonlyArray<Pick<Release, "id" | "progress">>,
  board: CountsBoard | undefined,
): ReadonlyMap<string, ReleaseItemCounts> {
  void board;
  return new Map(
    releases.map((release) => [
      release.id,
      countsFromProgress(release.progress),
    ]),
  );
}
