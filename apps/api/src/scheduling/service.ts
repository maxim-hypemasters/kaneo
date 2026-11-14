import { digest, publishedTasks } from "./snapshot";
import { scopeReleaseInput } from "./release-input";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import {
  projectTable,
  projectPlanTable,
  taskReminderSentTable,
  taskTable,
  userTable,
  workspaceUserTable,
} from "../database/schema";
import { publishEvent } from "../events";
import { findInaccessibleProjectIds } from "../project-access/find-inaccessible-project-ids";
import { roleHasWorkspacePermission } from "../utils/require-workspace-permission";
import { PLANNING_READ, PLANNING_WRITE } from "./planning-permissions";
import { retryTransaction } from "../utils/retry-transaction";
import { hasInstanceAdminRole } from "../utils/instance-admin-role";
import { buildSchedule } from "./engine/build-schedule";
import { assertWithinCodeFreeze } from "./assert-code-freeze";
import { readScheduleInput, type PlanningTransaction } from "./read-input";

type Loaded = Awaited<ReturnType<typeof readScheduleInput>>;
type ApplyInput = {
  asOf: string;
  planFrom: string;
  revision: string;
  generation: number;
};

export function scheduleInputRevision(loaded: Loaded) {
  return digest(loaded.revisionInput);
}
function previewToken(
  inputRevision: string,
  generation: number,
  asOf: string,
  planFrom: string,
) {
  return digest({ planner: 1, inputRevision, generation, asOf, planFrom });
}
export function scheduleRead(loaded: Loaded) {
  const revision = scheduleInputRevision(loaded);
  return {
    generation: loaded.project.scheduleGeneration,
    appliedAt: loaded.project.scheduleAppliedAt?.toISOString() ?? null,
    revision,
    legacy: loaded.project.scheduleGeneration === 0,
    outdated:
      loaded.project.scheduleGeneration > 0 &&
      (loaded.project.scheduleRevision !== revision ||
        (loaded.hasRunningTimers &&
          Date.now() - (loaded.project.scheduleAppliedAt?.getTime() ?? 0) >
            60_000)),
    settings: {
      timeZone: loaded.project.planningTimeZone,
      estimateDayMinutes: loaded.project.estimateDayMinutes,
    },
    tasks: publishedTasks(loaded),
  };
}
function preview(loaded: Loaded) {
  if (!loaded.project.planningTimeZone)
    throw new HTTPException(400, {
      message: "Configure the project planning timezone first",
    });
  const result = buildSchedule(loaded.input);
  const inputRevision = scheduleInputRevision(loaded);
  const tasks = result.tasks.map((task) => ({
    taskId: task.id,
    assigneeId: task.assigneeId,
    start: task.start,
    end: task.end,
    segments: task.segments,
    reason: task.reason,
  }));
  // Completed historical placements are visible, but reserve no future work.
  const done = new Set(
    loaded.input.tasks
      .filter((task) => task.state === "done")
      .map((task) => task.id),
  );
  const combined = [
    ...tasks.filter((task) => !done.has(task.taskId)),
    ...publishedTasks(loaded).filter((task) => done.has(task.taskId)),
  ];
  const old = new Map(
    publishedTasks(loaded).map((task) => [task.taskId, task]),
  );
  return {
    asOf: result.asOf,
    expiresAt: new Date(Date.parse(result.asOf) + 15 * 60_000).toISOString(),
    planFrom: result.planFrom,
    inputRevision,
    revision: previewToken(
      inputRevision,
      loaded.project.scheduleGeneration,
      result.asOf,
      result.planFrom,
    ),
    generation: loaded.project.scheduleGeneration,
    tasks: combined,
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
    changedCount: combined.filter((task) => {
      const prior = old.get(task.taskId);
      return (
        !prior ||
        task.start !== prior.start ||
        task.end !== prior.end ||
        task.assigneeId !== prior.assigneeId ||
        task.segments.length !== prior.segments.length ||
        task.segments.some(
          (segment, index) =>
            segment.start !== prior.segments[index]?.start ||
            segment.end !== prior.segments[index]?.end,
        )
      );
    }).length,
  };
}
export async function readSnapshot<T>(
  read: (tx: PlanningTransaction) => Promise<T>,
) {
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`set local statement_timeout = '10s'`);
      return read(tx);
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function getProjectSchedule(
  projectId: string,
  userId: string,
  expectedWorkspaceId?: string,
) {
  const now = new Date().toISOString();
  return readSnapshot(async (tx) => {
    const plans = await tx
      .selectDistinctOn([projectPlanTable.releaseId], {
        releaseId: projectPlanTable.releaseId,
        generation: projectPlanTable.generation,
        inputRevision: projectPlanTable.inputRevision,
        appliedAt: projectPlanTable.appliedAt,
        projectRevision: projectTable.scheduleRevision,
      })
      .from(projectPlanTable)
      .innerJoin(projectTable, eq(projectTable.id, projectPlanTable.projectId))
      .where(eq(projectPlanTable.projectId, projectId))
      .orderBy(projectPlanTable.releaseId, desc(projectPlanTable.generation));
    const latest = plans.reduce<(typeof plans)[number] | undefined>(
      (last, row) => (!last || row.generation > last.generation ? row : last),
      undefined,
    );
    const releaseMode = Boolean(
      latest && (latest.releaseId != null || latest.projectRevision === null),
    );
    const loaded = await readScheduleInput(tx, projectId, userId, now, now, {
      uniformCalendars: releaseMode,
    });
    assertWorkspace(loaded.project.workspaceId, expectedWorkspaceId);
    await recheckApplyAccess(
      tx,
      projectId,
      userId,
      loaded.project.workspaceId,
      false,
      false,
    );
    const current = scheduleRead(loaded);
    if (!releaseMode) return current;
    const existing = new Set(
      loaded.input.releases.map((release) => release.id),
    );
    const baseRevision = digest(loaded.revisionInput);
    return {
      ...current,
      settings: { timeZone: loaded.input.timeZone, estimateDayMinutes: 480 },
      outdated: plans.some(
        (plan) =>
          plan.releaseId &&
          existing.has(plan.releaseId) &&
          (plan.inputRevision !==
            scopeReleaseInput(loaded, plan.releaseId, baseRevision).revision ||
            (loaded.hasRunningTimers &&
              Date.now() - plan.appliedAt.getTime() > 60_000)),
      ),
    };
  });
}
export async function previewProjectSchedule(
  projectId: string,
  userId: string,
  planFrom?: string,
  expectedWorkspaceId?: string,
) {
  const asOf = new Date().toISOString();
  const from = planFrom && planFrom > asOf ? planFrom : asOf;
  return readSnapshot(async (tx) => {
    const loaded = await readScheduleInput(tx, projectId, userId, asOf, from);
    assertWorkspace(loaded.project.workspaceId, expectedWorkspaceId);
    await recheckApplyAccess(
      tx,
      projectId,
      userId,
      loaded.project.workspaceId,
      true,
      false,
    );
    return preview(loaded);
  });
}
export function assertWorkspace(actual: string, expected?: string) {
  if (expected && actual !== expected)
    throw new HTTPException(409, {
      message: "Project changed workspaces; retry the request",
    });
}
export async function recheckApplyAccess(
  tx: PlanningTransaction,
  projectId: string,
  userId: string,
  workspaceId: string,
  manage = true,
  lock = true,
) {
  const members = tx
    .select()
    .from(workspaceUserTable)
    .where(
      and(
        eq(workspaceUserTable.workspaceId, workspaceId),
        eq(workspaceUserTable.userId, userId),
      ),
    );
  const [member] = await (lock ? members.for("share") : members);
  const [user] = await tx
    .select({ role: userTable.role })
    .from(userTable)
    .where(eq(userTable.id, userId));
  const instanceAdmin = hasInstanceAdminRole(user?.role);
  if (
    (!instanceAdmin &&
      (!member ||
        !(await roleHasWorkspacePermission(
          workspaceId,
          member.role,
          manage ? PLANNING_WRITE : PLANNING_READ,
          tx,
        )))) ||
    (await findInaccessibleProjectIds(userId, [projectId], tx)).length
  )
    throw new HTTPException(403, {
      message: "No permission to apply this project plan",
    });
}
export async function applyProjectSchedule(
  projectId: string,
  userId: string,
  input: ApplyInput,
  expectedWorkspaceId?: string,
) {
  const age = Date.now() - Date.parse(input.asOf);
  if (age < -5000 || age > 15 * 60_000)
    throw new HTTPException(409, {
      message: "Preview expired; recalculate the plan",
    });
  await retryTransaction(() =>
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
        const loaded = await readScheduleInput(
          tx,
          projectId,
          userId,
          input.asOf,
          input.planFrom,
        );
        const proposed = preview(loaded);
        if (
          input.generation !== project.scheduleGeneration ||
          proposed.revision !== input.revision
        )
          throw new HTTPException(409, {
            message: "Planning inputs changed; recalculate the preview",
          });
        assertWithinCodeFreeze(proposed.warnings);
        const active = new Set(
          loaded.input.tasks
            .filter((task) => task.state !== "done")
            .map((task) => task.id),
        );
        const placements = proposed.tasks.filter((task) =>
          active.has(task.taskId),
        );
        const before = new Map(loaded.tasks.map((task) => [task.id, task]));
        const changedDue = placements
          .filter(
            (task) =>
              (before.get(task.taskId)?.dueDate?.toISOString() ?? null) !==
              task.end,
          )
          .map((task) => task.taskId);
        // Bound SQL parameters while keeping the complete Apply atomic.
        for (let offset = 0; offset < placements.length; offset += 1000) {
          const values = placements
            .slice(offset, offset + 1000)
            .map(
              (task) =>
                sql`(${task.taskId}::text, ${task.start}::timestamp, ${task.end}::timestamp, ${JSON.stringify(task.segments)}::jsonb, ${task.start ? task.assigneeId : null}::text)`,
            );
          await tx.execute(
            sql`update ${taskTable} set start_date = p.start_date, due_date = p.due_date, schedule_segments = p.segments, scheduled_assignee_id = p.assignee_id, updated_at = (now() at time zone 'utc') from (values ${sql.join(values, sql`, `)}) as p(id,start_date,due_date,segments,assignee_id) where ${taskTable.id} = p.id and ${taskTable.projectId} = ${projectId} and (${taskTable.startDate}, ${taskTable.dueDate}, ${taskTable.scheduleSegments}, ${taskTable.scheduledAssigneeId}) is distinct from (p.start_date, p.due_date, p.segments, p.assignee_id)`,
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
        await tx.insert(projectPlanTable).values({
          projectId,
          generation: project.scheduleGeneration + 1,
          inputRevision: proposed.inputRevision,
          asOf: new Date(input.asOf),
          planFrom: new Date(input.planFrom),
          timeZone: loaded.input.timeZone,
          appliedBy: userId,
          placements: proposed.tasks,
        });
        await tx
          .update(projectTable)
          .set({
            scheduleGeneration: project.scheduleGeneration + 1,
            scheduleRevision: proposed.inputRevision,
            scheduleAppliedAt: new Date(),
          })
          .where(eq(projectTable.id, projectId));
      },
      { isolationLevel: "serializable" },
    ),
  );
  await publishEvent("project-schedule.changed", {
    projectId,
    userId,
    published: true,
  });
  return getProjectSchedule(projectId, userId, expectedWorkspaceId);
}

export async function savePlanningSettings(
  projectId: string,
  userId: string,
  workspaceId: string,
  settings: { timeZone: string; estimateDayMinutes: number },
) {
  await db.transaction(async (tx) => {
    const [project] = await tx
      .select()
      .from(projectTable)
      .where(eq(projectTable.id, projectId))
      .for("update");
    if (!project)
      throw new HTTPException(404, { message: "Project not found" });
    assertWorkspace(project.workspaceId, workspaceId);
    await recheckApplyAccess(tx, projectId, userId, workspaceId);
    await tx
      .update(projectTable)
      .set({
        planningTimeZone: settings.timeZone,
        estimateDayMinutes: settings.estimateDayMinutes,
      })
      .where(eq(projectTable.id, projectId));
  });
  await publishEvent("project-schedule.changed", { projectId });
  return getProjectSchedule(projectId, userId, workspaceId);
}
