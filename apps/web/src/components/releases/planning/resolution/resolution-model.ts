import { compareReleasesByStart } from "@/lib/releases/sort-releases";
import type { Release } from "@/types/release";
import type {
  ReleasePlanChanges,
  ReleasePlanMoveTarget,
  ReleasePlanPreview,
  ReleasePlanTask,
} from "@/types/release-plan";

type ReleaseWorkGroup = {
  id: string | null;
  title: string | null;
  featureId: string | null;
  featureTitle: string | null;
  position: number;
  tasks: ReleasePlanTask[];
};

export type MoveSelection =
  | { kind: "task"; task: ReleasePlanTask }
  | { kind: "late"; taskIds: string[] }
  | {
      kind: "milestone";
      milestoneId: string;
      title: string;
      taskIds: string[];
      moveMilestone: boolean;
    };

function finishTime(task: ReleasePlanTask) {
  const timestamp = Date.parse(task.end ?? "");
  return Number.isNaN(timestamp) ? Infinity : timestamp;
}

export function releaseWorkGroups(tasks: readonly ReleasePlanTask[]) {
  const groups = new Map<string, ReleaseWorkGroup>();
  for (const task of tasks) {
    const id = task.milestoneId ?? null;
    const key = id ?? "no-milestone";
    const group = groups.get(key) ?? {
      id,
      title: task.milestoneTitle ?? null,
      featureId: id ? (task.featureId ?? null) : null,
      featureTitle: id ? (task.featureTitle ?? null) : null,
      position: task.milestonePosition ?? 0,
      tasks: [],
    };
    group.tasks.push(task);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.tasks.sort((a, b) => {
      const first = finishTime(a);
      const second = finishTime(b);
      return first === second ? 0 : first - second;
    });
  }
  return [...groups.values()].sort(
    (a, b) =>
      Number(a.id === null) - Number(b.id === null) ||
      (a.featureTitle ?? "").localeCompare(b.featureTitle ?? "") ||
      (a.featureId ?? "").localeCompare(b.featureId ?? "") ||
      a.position - b.position ||
      (a.id ?? "").localeCompare(b.id ?? ""),
  );
}

export function nextRelease(release: Release, releases: readonly Release[]) {
  return releases
    .filter((candidate) => candidate.startDate > release.startDate)
    .sort(compareReleasesByStart)[0];
}

export function downstreamTasks(
  preview: ReleasePlanPreview,
  taskId: string,
): ReleasePlanTask[] {
  const tasks = new Map(preview.tasks.map((task) => [task.taskId, task]));
  const children = new Map<string, string[]>();
  for (const edge of preview.dependencies) {
    const list = children.get(edge.blockerId) ?? [];
    list.push(edge.blockedId);
    children.set(edge.blockerId, list);
  }
  const visited = new Set([taskId]);
  const pending = [taskId];
  while (pending.length) {
    for (const id of children.get(pending.pop()!) ?? []) {
      if (visited.has(id)) continue;
      visited.add(id);
      const task = tasks.get(id);
      // Completed blockers are already satisfied; their downstream work does
      // not need to follow an unfinished ancestor into another release.
      if (!task || task.completed || task.reason === "archived") continue;
      pending.push(id);
    }
  }
  return preview.tasks.filter(
    (task) =>
      task.taskId !== taskId &&
      visited.has(task.taskId) &&
      !task.completed &&
      task.reason !== "archived",
  );
}

export function pruneDestination(
  changes: ReleasePlanChanges,
): ReleasePlanChanges {
  if (
    changes.newRelease &&
    ![...(changes.moves ?? []), ...(changes.milestoneMoves ?? [])].some(
      ({ target }) =>
        "draftKey" in target && target.draftKey === changes.newRelease?.key,
    )
  ) {
    const { newRelease: _unused, ...rest } = changes;
    return rest;
  }
  return changes;
}

export function moveTasks(
  changes: ReleasePlanChanges,
  taskIds: readonly string[],
  target: ReleasePlanMoveTarget,
  newRelease = changes.newRelease,
): ReleasePlanChanges {
  const moves = new Map(changes.moves?.map((move) => [move.taskId, move]));
  for (const taskId of taskIds) moves.set(taskId, { taskId, target });
  return pruneDestination({
    ...changes,
    moves: [...moves.values()],
    newRelease,
  });
}

export function moveMilestone(
  changes: ReleasePlanChanges,
  milestoneId: string,
  target: ReleasePlanMoveTarget,
  newRelease = changes.newRelease,
): ReleasePlanChanges {
  const moves = new Map(
    changes.milestoneMoves?.map((move) => [move.milestoneId, move]),
  );
  moves.set(milestoneId, { milestoneId, target });
  return pruneDestination({
    ...changes,
    milestoneMoves: [...moves.values()],
    newRelease,
  });
}

export function undoMove(changes: ReleasePlanChanges, taskId: string) {
  const moves = changes.moves?.filter((move) => move.taskId !== taskId);
  const { moves: _oldMoves, ...rest } = changes;
  return pruneDestination(moves?.length ? { ...rest, moves } : rest);
}

export function undoMilestoneMove(
  changes: ReleasePlanChanges,
  milestoneId: string,
) {
  const milestoneMoves = changes.milestoneMoves?.filter(
    (move) => move.milestoneId !== milestoneId,
  );
  const { milestoneMoves: _oldMoves, ...rest } = changes;
  return pruneDestination(
    milestoneMoves?.length ? { ...rest, milestoneMoves } : rest,
  );
}
