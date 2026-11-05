import type {
  ReleasePlanChanges,
  ReleasePlanPreview,
  ReleasePlanMoveTarget,
  ReleasePlanTask,
} from "@/types/release-plan";

function normalizeTarget(target: ReleasePlanMoveTarget): ReleasePlanMoveTarget {
  return "releaseId" in target
    ? { releaseId: target.releaseId }
    : { draftKey: target.draftKey };
}

export function normalizePlanChanges(
  value: ReleasePlanChanges,
): ReleasePlanChanges {
  const moves = value.moves
    ?.map(({ taskId, target }) => ({
      taskId,
      target: normalizeTarget(target),
    }))
    .sort((a, b) => a.taskId.localeCompare(b.taskId));
  const newRelease = value.newRelease;
  const milestoneMoves = value.milestoneMoves
    ?.map(({ milestoneId, target }) => ({
      milestoneId,
      target: normalizeTarget(target),
    }))
    .sort((a, b) => a.milestoneId.localeCompare(b.milestoneId));
  return {
    ...(value.releaseDates
      ? {
          releaseDates: {
            codeFreezeDate: value.releaseDates.codeFreezeDate,
            submissionDate: value.releaseDates.submissionDate,
          },
        }
      : {}),
    ...(moves?.length ? { moves } : {}),
    ...(milestoneMoves?.length ? { milestoneMoves } : {}),
    ...(newRelease &&
    [...(moves ?? []), ...(milestoneMoves ?? [])].some(
      ({ target }) =>
        "draftKey" in target && target.draftKey === newRelease.key,
    )
      ? {
          newRelease: {
            key: newRelease.key,
            name: newRelease.name.trim(),
            startDate: newRelease.startDate,
            codeFreezeDate: newRelease.codeFreezeDate,
            submissionDate: newRelease.submissionDate,
          },
        }
      : {}),
  };
}

export function plannedMoveTaskIds(
  changes: ReleasePlanChanges,
  tasks: readonly ReleasePlanTask[],
) {
  const ids = new Set(changes.moves?.map(({ taskId }) => taskId));
  const milestones = new Set(
    changes.milestoneMoves?.map(({ milestoneId }) => milestoneId),
  );
  for (const task of tasks) {
    if (
      task.milestoneId &&
      milestones.has(task.milestoneId) &&
      !task.completed &&
      task.reason !== "archived"
    )
      ids.add(task.taskId);
  }
  return ids;
}

export const planChangesKey = (value: ReleasePlanChanges) =>
  JSON.stringify(normalizePlanChanges(value));

export function lateTaskIds(preview: ReleasePlanPreview) {
  const warnings = new Set(
    preview.warnings
      .filter(({ reason }) => reason === "after_code_freeze")
      .map(({ taskId }) => taskId),
  );
  return new Set(
    preview.tasks
      .filter(
        (task) =>
          !task.completed &&
          task.reason !== "archived" &&
          warnings.has(task.taskId),
      )
      .map(({ taskId }) => taskId),
  );
}

export function hasCodeFreezeConflicts(preview: ReleasePlanPreview | null) {
  return preview !== null && lateTaskIds(preview).size > 0;
}
