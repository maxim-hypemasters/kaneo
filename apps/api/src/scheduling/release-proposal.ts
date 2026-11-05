import { buildSchedule } from "./engine/build-schedule";
import {
  contextualize,
  releasePlacements,
  type ReleaseInput,
} from "./release-input";
import { digest } from "./snapshot";

export function releasePreviewToken(loaded: ReleaseInput) {
  return digest({
    planner: "release-3",
    releaseId: loaded.releaseId,
    revision: loaded.revision,
    changes: loaded.changes,
    ...(loaded.milestoneMoves.length
      ? {
          milestones: loaded.milestoneMoves,
          taskMoves: [...loaded.taskMoves],
          memberships: loaded.tasks
            .filter(({ id }) => loaded.taskMoves.has(id))
            .map(({ id, milestoneId }) => [id, milestoneId]),
        }
      : {}),
    generation: loaded.project.scheduleGeneration,
    asOf: loaded.input.asOf,
    timeZone: loaded.input.timeZone,
  });
}

export function releasePreview(loaded: ReleaseInput) {
  const release = loaded.input.releases.find(
    (item) => item.id === loaded.releaseId,
  )!;
  const result = buildSchedule(loaded.input, "local-day");
  const tasks = result.tasks.map((task) => ({
    taskId: task.id,
    assigneeId: task.assigneeId,
    start: task.start,
    end: task.end,
    segments: task.segments,
    reason: task.reason,
  }));
  const completed = new Set(
    loaded.input.tasks
      .filter((task) => task.state === "done")
      .map((task) => task.id),
  );
  const prior = releasePlacements(loaded);
  const combined = [
    ...tasks,
    ...prior.filter((task) => completed.has(task.taskId)),
  ];
  const decorated = contextualize(loaded, combined, true);
  const visibleIds = new Set(decorated.map((task) => task.taskId));
  return {
    releaseId: loaded.releaseId,
    changes: loaded.changes,
    releaseDates: {
      startDate: release.startDate,
      codeFreezeDate: release.codeFreezeDate,
      submissionDate: release.submissionDate,
    },
    asOf: result.asOf,
    expiresAt: new Date(Date.parse(result.asOf) + 15 * 60_000).toISOString(),
    planFrom: result.planFrom,
    timeZone: loaded.input.timeZone,
    revision: releasePreviewToken(loaded),
    inputRevision: loaded.revision,
    generation: loaded.project.scheduleGeneration,
    tasks: decorated,
    dependencies: loaded.input.dependencies.filter(
      (edge) =>
        visibleIds.has(edge.blockerId) && visibleIds.has(edge.blockedId),
    ),
    diagnostics: tasks
      .filter((task) => task.reason && task.reason !== "archived")
      .map((task) => ({ taskId: task.taskId, reason: task.reason! })),
    warnings: result.warnings.map((warning) => ({
      taskId: warning.taskId,
      reason: warning.code,
    })),
    scheduledCount: tasks.filter((task) => task.start).length,
    unscheduledCount: tasks.filter(
      (task) => !task.start && task.reason !== "archived",
    ).length,
    changedCount: decorated.filter((task) => task.changed).length,
  };
}
