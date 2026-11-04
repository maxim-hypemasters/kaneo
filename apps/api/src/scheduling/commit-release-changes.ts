import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { ApiError } from "../errors/api-error";
import {
  milestoneTable,
  taskReminderSentTable,
  taskTable,
} from "../database/schema";
import { recordMilestoneActivity } from "../milestone/planning";
import {
  lockRelease,
  setReleaseOf,
} from "../release/membership/assign-release";
import { recordReleaseChange } from "../release/membership/record-release-change";
import {
  insertReleaseInTransaction,
  updateReleaseInTransaction,
} from "../release/write-release-in-transaction";
import type { PlanningTransaction } from "./read-input";
import { draftReleaseId, readMilestonesForMoves } from "./release-changes";
import type { ReleaseInput } from "./release-input";

export async function commitReleaseChanges(
  tx: PlanningTransaction,
  loaded: ReleaseInput,
  userId: string,
) {
  const { changes, releaseId, milestoneMoves, taskMoves } = loaded;
  if (milestoneMoves.length) {
    const reviewed = new Map(milestoneMoves.map((move) => [move.id, move]));
    const locked = await readMilestonesForMoves(
      tx,
      loaded.project.id,
      [...reviewed.keys()],
      true,
    );
    if (
      locked.length !== milestoneMoves.length ||
      locked.some(
        (milestone) =>
          milestone.releaseId !== reviewed.get(milestone.id)?.releaseId ||
          milestone.featureId !== reviewed.get(milestone.id)?.featureId,
      )
    )
      throw new ApiError(409, {
        code: "PLAN_MOVE_CONFLICT",
        message: "Selected milestones changed; recalculate the preview",
      });
  }
  const tasks = taskMoves.size
    ? await tx
        .select()
        .from(taskTable)
        .where(
          and(
            eq(taskTable.projectId, loaded.project.id),
            sql`${taskTable.id} = ANY(${sql.param([...taskMoves.keys()])}::text[])`,
          ),
        )
        .orderBy(asc(taskTable.id))
        .for("update")
    : [];
  if (
    tasks.length !== taskMoves.size ||
    tasks.some((task) => task.releaseId !== releaseId)
  )
    throw new ApiError(409, {
      code: "PLAN_MOVE_CONFLICT",
      message: "Selected work is no longer in this release",
    });
  const destination = changes.newRelease
    ? await insertReleaseInTransaction(
        tx,
        loaded.project.id,
        changes.newRelease,
      )
    : null;
  if (changes.releaseDates)
    await updateReleaseInTransaction(tx, releaseId, changes.releaseDates);
  const draftId = changes.newRelease && draftReleaseId(changes.newRelease.key);
  const targetReleaseId = (id: string) =>
    destination && id === draftId ? destination.id : id;
  const groups = new Map<string, string[]>();
  for (const task of tasks) {
    const targetId = targetReleaseId(taskMoves.get(task.id)!);
    const ids = groups.get(targetId) ?? [];
    ids.push(task.id);
    groups.set(targetId, ids);
  }
  for (const move of milestoneMoves) {
    const targetId = targetReleaseId(move.targetId);
    if (!groups.has(targetId)) groups.set(targetId, []);
  }
  for (const [targetId, taskIds] of [...groups].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    await lockRelease(tx, targetId, loaded.project.id);
    await setReleaseOf(tx, taskIds, targetId);
    await recordReleaseChange(tx, {
      taskIds,
      projectId: loaded.project.id,
      from: releaseId,
      to: targetId,
      userId,
    });
  }
  for (const move of milestoneMoves) {
    const targetId = targetReleaseId(move.targetId);
    await tx
      .update(milestoneTable)
      .set({ releaseId: targetId })
      .where(eq(milestoneTable.id, move.id));
    await recordMilestoneActivity(
      tx,
      move.featureId,
      move,
      "milestone_updated",
      userId,
      { releaseId: { from: move.releaseId, to: targetId } },
    );
  }
  // Deferred work must stop reserving the placement from its old release.
  // The immutable prior plan still records that historical placement.
  for (let offset = 0; offset < tasks.length; offset += 1000) {
    const ids = tasks.slice(offset, offset + 1000).map((task) => task.id);
    await tx
      .update(taskTable)
      .set({
        startDate: null,
        dueDate: null,
        scheduleSegments: [],
        scheduledAssigneeId: null,
      })
      .where(inArray(taskTable.id, ids));
    await tx
      .delete(taskReminderSentTable)
      .where(inArray(taskReminderSentTable.taskId, ids));
  }
  return {
    movedTasks: tasks.map(({ id, featureId }) => ({ id, featureId })),
    movedMilestones: milestoneMoves.map(({ id, featureId }) => ({
      id,
      featureId,
    })),
    releaseChanged: Boolean(
      destination ||
      changes.releaseDates ||
      tasks.length ||
      milestoneMoves.length,
    ),
  };
}
