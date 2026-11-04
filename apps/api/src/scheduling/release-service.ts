import { eq, inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import {
  projectPlanTable,
  projectTable,
  taskReminderSentTable,
  taskTable,
} from "../database/schema";
import { publishEvent } from "../events";
import { retryTransaction } from "../utils/retry-transaction";
import {
  contextualize,
  readReleaseInput,
  releasePlacements,
  type ReleaseInput,
} from "./release-input";
import { assertWorkspace, readSnapshot, recheckApplyAccess } from "./service";
import { releasePreview, releasePreviewToken } from "./release-proposal";
import { assertWithinCodeFreeze } from "./assert-code-freeze";
import { commitReleaseChanges } from "./commit-release-changes";
import type { ReleasePlanChanges } from "./release-changes-schema";
import { publishReleaseChange } from "../release/membership/publish-release-change";
import { publishFeatureChange } from "../task/feature-hierarchy/publish-feature-change";
import { publishMilestoneChange } from "../milestone/write-milestones";

function releaseRead(loaded: ReleaseInput) {
  return {
    releaseId: loaded.releaseId,
    timeZone: loaded.input.timeZone,
    generation: loaded.project.scheduleGeneration,
    planned: Boolean(loaded.lastPlan),
    appliedAt: loaded.lastPlan?.appliedAt.toISOString() ?? null,
    revision: loaded.revision,
    inputRevision: loaded.revision,
    outdated: Boolean(
      loaded.lastPlan &&
      (loaded.lastPlan.inputRevision !== loaded.revision ||
        (loaded.hasRunningTimers &&
          Date.now() - loaded.lastPlan.appliedAt.getTime() > 60_000)),
    ),
    legacy: !loaded.lastPlan,
    settings: { timeZone: loaded.input.timeZone, estimateDayMinutes: 480 },
    tasks: contextualize(loaded, releasePlacements(loaded)),
  };
}

export async function getReleaseSchedule(
  projectId: string,
  releaseId: string,
  userId: string,
  expectedWorkspaceId?: string,
  timeZone?: string,
) {
  return readSnapshot(async (tx) => {
    const loaded = await readReleaseInput(
      tx,
      projectId,
      releaseId,
      userId,
      new Date().toISOString(),
      timeZone,
    );
    assertWorkspace(loaded.project.workspaceId, expectedWorkspaceId);
    await recheckApplyAccess(
      tx,
      projectId,
      userId,
      loaded.project.workspaceId,
      false,
      false,
    );
    return releaseRead(loaded);
  });
}

export async function previewReleaseSchedule(
  projectId: string,
  releaseId: string,
  userId: string,
  expectedWorkspaceId?: string,
  timeZone?: string,
  changes?: ReleasePlanChanges,
) {
  return readSnapshot(async (tx) => {
    const loaded = await readReleaseInput(
      tx,
      projectId,
      releaseId,
      userId,
      new Date().toISOString(),
      timeZone,
      changes,
    );
    assertWorkspace(loaded.project.workspaceId, expectedWorkspaceId);
    await recheckApplyAccess(
      tx,
      projectId,
      userId,
      loaded.project.workspaceId,
      true,
      false,
    );
    return releasePreview(loaded);
  });
}

export async function applyReleaseSchedule(
  projectId: string,
  releaseId: string,
  userId: string,
  input: {
    asOf: string;
    revision: string;
    generation: number;
    timeZone: string;
    changes?: ReleasePlanChanges;
  },
  expectedWorkspaceId?: string,
) {
  const age = Date.now() - Date.parse(input.asOf);
  if (age < -5000 || age > 15 * 60_000)
    throw new HTTPException(409, {
      message: "Preview expired; recalculate the plan",
    });
  const committed = await retryTransaction(() =>
    db.transaction(
      async (tx) => {
        await tx.execute(sql`set local statement_timeout = '15s'`);
        const [project] = await tx
          .select()
          .from(projectTable)
          .where(eq(projectTable.id, projectId))
          .for("update");
        if (!project)
          throw new HTTPException(404, { message: "Project not found" });
        assertWorkspace(project.workspaceId, expectedWorkspaceId);
        await recheckApplyAccess(tx, projectId, userId, project.workspaceId);
        const loaded = await readReleaseInput(
          tx,
          projectId,
          releaseId,
          userId,
          input.asOf,
          input.timeZone,
          input.changes,
        );
        if (
          input.generation !== project.scheduleGeneration ||
          input.revision !== releasePreviewToken(loaded)
        )
          throw new HTTPException(409, {
            message: "Planning inputs changed; recalculate the preview",
          });
        const proposed = releasePreview(loaded);
        assertWithinCodeFreeze(proposed.warnings);
        const changed = await commitReleaseChanges(tx, loaded, userId);
        const unfinished = new Set(
          loaded.input.tasks
            .filter((task) => task.state !== "done")
            .map((task) => task.id),
        );
        const placements = proposed.tasks.filter((task) =>
          unfinished.has(task.taskId),
        );
        const old = new Map(loaded.tasks.map((task) => [task.id, task]));
        const changedDue = placements
          .filter(
            (task) =>
              (old.get(task.taskId)?.dueDate?.toISOString() ?? null) !==
              task.end,
          )
          .map((task) => task.taskId);
        for (let offset = 0; offset < placements.length; offset += 1000) {
          const values = placements
            .slice(offset, offset + 1000)
            .map(
              (task) =>
                sql`(${task.taskId}::text, ${task.start}::timestamp, ${task.end}::timestamp, ${JSON.stringify(task.segments)}::jsonb, ${task.start ? task.assigneeId : null}::text)`,
            );
          await tx.execute(
            sql`update ${taskTable} set start_date=p.start_date,due_date=p.due_date,schedule_segments=p.segments,scheduled_assignee_id=p.assignee_id,updated_at=(now() at time zone 'utc') from (values ${sql.join(values, sql`, `)}) as p(id,start_date,due_date,segments,assignee_id) where ${taskTable.id}=p.id and ${taskTable.projectId}=${projectId} and (${taskTable.startDate},${taskTable.dueDate},${taskTable.scheduleSegments},${taskTable.scheduledAssigneeId}) is distinct from (p.start_date,p.due_date,p.segments,p.assignee_id)`,
          );
        }
        for (let offset = 0; offset < changedDue.length; offset += 1000)
          await tx
            .delete(taskReminderSentTable)
            .where(
              inArray(
                taskReminderSentTable.taskId,
                changedDue.slice(offset, offset + 1000),
              ),
            );
        const afterChanges = await readReleaseInput(
          tx,
          projectId,
          releaseId,
          userId,
          input.asOf,
          input.timeZone,
        );
        await tx.insert(projectPlanTable).values({
          projectId,
          releaseId,
          generation: project.scheduleGeneration + 1,
          inputRevision: afterChanges.revision,
          asOf: new Date(input.asOf),
          planFrom: new Date(proposed.planFrom),
          timeZone: loaded.input.timeZone,
          appliedBy: userId,
          placements: proposed.tasks,
        });
        await tx
          .update(projectTable)
          .set({
            planningTimeZone: project.planningTimeZone ?? loaded.input.timeZone,
            scheduleGeneration: project.scheduleGeneration + 1,
            scheduleRevision: null,
            scheduleAppliedAt: new Date(),
          })
          .where(eq(projectTable.id, projectId));
        return changed;
      },
      { isolationLevel: "serializable" },
    ),
  );
  if (committed.releaseChanged)
    await publishEvent("release.changed", { projectId });
  for (const milestone of committed.movedMilestones)
    await publishMilestoneChange(
      projectId,
      milestone.featureId,
      milestone.id,
      userId,
    );
  if (committed.movedTasks.length) {
    await publishReleaseChange({
      projectId,
      taskIds: committed.movedTasks.map((task) => task.id),
      userId,
    });
    await publishFeatureChange({
      projectId,
      featureIds: committed.movedTasks.map((task) => task.featureId),
      userId,
    });
  }
  await publishEvent("project-schedule.changed", {
    projectId,
    userId,
    published: true,
  });
  return getReleaseSchedule(
    projectId,
    releaseId,
    userId,
    expectedWorkspaceId,
    input.timeZone,
  );
}
