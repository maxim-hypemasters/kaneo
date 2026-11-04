import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { milestoneTable, releaseTable, taskTable } from "../database/schema";
import { ApiError } from "../errors/api-error";
import { assertReleaseDateOrder } from "../release/release-dates";
import type { PlanningTransaction, readScheduleInput } from "./read-input";
import {
  canonicalReleaseChanges,
  type ReleasePlanChanges,
  type ReleasePlanMoveTarget,
} from "./release-changes-schema";

type Loaded = Awaited<ReturnType<typeof readScheduleInput>>;
export const draftReleaseId = (key: string) => `draft-release:${key}`;

export function readMilestonesForMoves(
  tx: PlanningTransaction,
  projectId: string,
  ids: string[],
  lock = false,
) {
  const rows = tx
    .select({
      id: milestoneTable.id,
      featureId: milestoneTable.featureId,
      releaseId: milestoneTable.releaseId,
      title: milestoneTable.title,
    })
    .from(milestoneTable)
    .innerJoin(taskTable, eq(taskTable.id, milestoneTable.featureId))
    .where(
      and(
        eq(taskTable.projectId, projectId),
        eq(taskTable.type, "feature"),
        inArray(milestoneTable.id, ids),
      ),
    )
    .orderBy(milestoneTable.featureId, milestoneTable.id);
  return lock ? rows.for("update") : rows;
}

export async function overlayReleaseChanges(
  tx: PlanningTransaction,
  loaded: Loaded,
  releaseId: string,
  value?: ReleasePlanChanges,
) {
  const changes = canonicalReleaseChanges(value);
  const source = loaded.input.releases.find(
    (release) => release.id === releaseId,
  );
  if (!source)
    throw new HTTPException(404, {
      message: "Release not found in this project",
    });
  const dates = { ...source, ...changes.releaseDates };
  assertReleaseDateOrder(dates);
  const releases = new Map(
    loaded.input.releases.map((release) => [release.id, release]),
  );
  releases.set(releaseId, dates);
  let draftId: string | null = null;
  if (changes.newRelease) {
    const draft = changes.newRelease;
    assertReleaseDateOrder(draft);
    if (draft.startDate <= source.startDate)
      throw new HTTPException(400, {
        message: "The next release must start after this release",
      });
    const [existing] = await tx
      .select({ id: releaseTable.id })
      .from(releaseTable)
      .where(
        and(
          eq(releaseTable.projectId, loaded.project.id),
          eq(releaseTable.name, draft.name),
        ),
      )
      .limit(1);
    if (existing)
      throw new ApiError(409, {
        code: "RELEASE_NAME_TAKEN",
        message: "A release with this name already exists in this project",
      });
    draftId = draftReleaseId(draft.key);
    if (releases.has(draftId))
      throw new HTTPException(400, { message: "Invalid draft release key" });
    releases.set(draftId, {
      id: draftId,
      startDate: draft.startDate,
      codeFreezeDate: draft.codeFreezeDate,
      submissionDate: draft.submissionDate,
    });
  }
  const milestoneDrafts = changes.milestoneMoves ?? [];
  if (!changes.moves?.length && !milestoneDrafts.length)
    return {
      changes,
      milestoneMoves: [],
      taskMoves: new Map<string, string>(),
      loaded: {
        ...loaded,
        input: { ...loaded.input, releases: [...releases.values()] },
      },
    };
  const resolveTarget = (reference: ReleasePlanMoveTarget) => {
    const targetId =
      "releaseId" in reference
        ? reference.releaseId
        : draftReleaseId(reference.draftKey);
    const target = releases.get(targetId);
    if (
      !target ||
      target.startDate <= source.startDate ||
      ("releaseId" in reference && targetId === draftId)
    )
      throw new ApiError(409, {
        code: "PLAN_MOVE_CONFLICT",
        message:
          "The destination is unavailable or no longer a later release in this project",
      });
    return targetId;
  };
  const eligible = new Set(
    loaded.input.tasks
      .filter(
        (task) =>
          task.releaseId === releaseId &&
          task.state !== "done" &&
          task.state !== "archived",
      )
      .map((task) => task.id),
  );
  const milestones = milestoneDrafts.length
    ? await readMilestonesForMoves(
        tx,
        loaded.project.id,
        milestoneDrafts.map(({ milestoneId }) => milestoneId),
      )
    : [];
  const milestonesById = new Map(milestones.map((row) => [row.id, row]));
  const sourceMilestones = new Map<string, string>();
  if (milestoneDrafts.length) {
    for (const task of loaded.tasks) {
      if (
        eligible.has(task.id) &&
        task.milestoneId &&
        task.milestoneTitle !== null
      )
        sourceMilestones.set(task.id, task.milestoneId);
    }
  }
  const eligibleMilestones = new Set(sourceMilestones.values());
  const milestoneMoves = milestoneDrafts.map(({ milestoneId, target }) => {
    const milestone = milestonesById.get(milestoneId);
    if (
      !milestone ||
      !eligibleMilestones.has(milestoneId) ||
      (milestone.releaseId !== null && milestone.releaseId !== releaseId)
    )
      throw new ApiError(409, {
        code: "PLAN_MOVE_CONFLICT",
        message:
          "The milestone is unavailable, assigned to a different release, or has no unfinished work in this release",
      });
    return { ...milestone, targetId: resolveTarget(target) };
  });
  const milestoneTargets = new Map(
    milestoneMoves.map(({ id, targetId }) => [id, targetId]),
  );
  const taskMoves = new Map<string, string>();
  for (const [taskId, milestoneId] of sourceMilestones) {
    const targetId = milestoneTargets.get(milestoneId);
    if (targetId) taskMoves.set(taskId, targetId);
  }
  for (const move of changes.moves ?? []) {
    if (!eligible.has(move.taskId))
      throw new ApiError(409, {
        code: "PLAN_MOVE_CONFLICT",
        message:
          "Selected work is missing, completed, archived, or no longer in this release",
      });
    taskMoves.set(move.taskId, resolveTarget(move.target));
  }
  return {
    changes,
    milestoneMoves,
    taskMoves,
    loaded: {
      ...loaded,
      tasks: loaded.tasks.map((task) =>
        taskMoves.has(task.id)
          ? {
              ...task,
              releaseId: taskMoves.get(task.id)!,
              startDate: null,
              dueDate: null,
              scheduleSegments: [],
              scheduledAssigneeId: null,
            }
          : task,
      ),
      input: {
        ...loaded.input,
        releases: [...releases.values()],
        tasks: loaded.input.tasks.map((task) =>
          taskMoves.has(task.id)
            ? { ...task, releaseId: taskMoves.get(task.id)! }
            : task,
        ),
      },
    },
  };
}
