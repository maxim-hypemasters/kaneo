import { desc, and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { projectPlanTable } from "../database/schema";
import { readScheduleInput, type PlanningTransaction } from "./read-input";
import { digest, publishedTasks } from "./snapshot";
import { startOfLocalDay } from "./engine/zoned-time";
import { releaseTaskPrioritySchema } from "./release-schema";
import { overlayReleaseChanges } from "./release-changes";
import type { ReleasePlanChanges } from "./release-changes-schema";

export async function readReleaseInput(
  tx: PlanningTransaction,
  projectId: string,
  releaseId: string,
  userId: string,
  asOf: string,
  timeZone?: string,
  changes?: ReleasePlanChanges,
) {
  const loaded = await readScheduleInput(tx, projectId, userId, asOf, asOf, {
    uniformCalendars: true,
    timeZone,
  });
  const baseline = scopeReleaseInput(loaded, releaseId);
  const overlay = await overlayReleaseChanges(tx, loaded, releaseId, changes);
  const scoped = scopeReleaseInput(overlay.loaded, releaseId);
  const [lastPlan] = await tx
    .select()
    .from(projectPlanTable)
    .where(
      and(
        eq(projectPlanTable.projectId, projectId),
        eq(projectPlanTable.releaseId, releaseId),
      ),
    )
    .orderBy(desc(projectPlanTable.generation))
    .limit(1);
  return {
    ...scoped,
    revision: baseline.revision,
    changes: overlay.changes,
    milestoneMoves: overlay.milestoneMoves,
    taskMoves: overlay.taskMoves,
    lastPlan,
  };
}

export function scopeReleaseInput(
  loaded: Awaited<ReturnType<typeof readScheduleInput>>,
  releaseId: string,
  baseRevision = digest(loaded.revisionInput),
) {
  const release = loaded.input.releases.find((item) => item.id === releaseId);
  if (!release)
    throw new HTTPException(404, {
      message: "Release not found in this project",
    });
  const selected = new Set(
    loaded.input.tasks
      .filter((task) => task.releaseId === releaseId)
      .map((task) => task.id),
  );
  const states = new Map(
    loaded.input.tasks.map((task) => [task.id, task.state]),
  );
  // Preserve the whole published envelope: lower-priority work cannot be
  // threaded through another release's already approved task.
  const reservations = loaded.tasks.flatMap((task) =>
    !selected.has(task.id) &&
    !["done", "archived"].includes(states.get(task.id)!) &&
    task.scheduledAssigneeId &&
    task.scheduleSegments?.length &&
    task.startDate &&
    task.dueDate &&
    task.startDate < task.dueDate
      ? [
          {
            assigneeId: task.scheduledAssigneeId,
            start: task.startDate.toISOString(),
            end: task.dueDate.toISOString(),
          },
        ]
      : [],
  );
  const otherBlockers = loaded.tasks
    .filter((task) => !selected.has(task.id))
    .map((task) => ({
      id: task.id,
      available: true,
      state:
        states.get(task.id) === "done"
          ? ("done" as const)
          : states.get(task.id) === "archived"
            ? ("archived" as const)
            : ("unfinished" as const),
      appliedEnd: task.scheduleSegments?.length
        ? (task.dueDate?.toISOString() ?? null)
        : null,
    }));
  const planFrom = new Date(
    startOfLocalDay(release.startDate, loaded.input.timeZone),
  ).toISOString();
  const input = {
    ...loaded.input,
    planFrom,
    tasks: loaded.input.tasks.filter((task) => selected.has(task.id)),
    dependencies: loaded.input.dependencies.filter((edge) =>
      selected.has(edge.blockedId),
    ),
    externalBlockers: [
      ...(loaded.input.externalBlockers ?? []),
      ...otherBlockers,
    ],
    reservations,
  };
  const revision = digest({
    releaseId,
    baseRevision,
    reservations,
    otherBlockers,
  });
  return { ...loaded, input, releaseId, selected, revision };
}

export type ReleaseInput = Awaited<ReturnType<typeof readReleaseInput>>;
export type ReleasePlacement = {
  taskId: string;
  assigneeId: string | null;
  start: string | null;
  end: string | null;
  segments: { start: string; end: string }[];
  reason: string | null;
};

export function releasePlacements(loaded: ReleaseInput) {
  return publishedTasks(loaded).filter((task) =>
    loaded.selected.has(task.taskId),
  );
}

export function contextualize(
  loaded: ReleaseInput,
  placements: ReleasePlacement[],
  preview = false,
) {
  const rows = new Map(loaded.tasks.map((task) => [task.id, task]));
  const completed = new Set(
    loaded.input.tasks
      .filter((task) => task.state === "done")
      .map((task) => task.id),
  );
  const previous = new Map(
    releasePlacements(loaded).map((task) => [task.taskId, task]),
  );
  return placements.map((placement) => {
    const task = rows.get(placement.taskId)!;
    const prior = previous.get(placement.taskId);
    return {
      ...placement,
      reason: task.status === "archived" ? "archived" : placement.reason,
      completed: completed.has(task.id),
      changed:
        preview &&
        (!prior ||
          prior.start !== placement.start ||
          prior.end !== placement.end ||
          prior.assigneeId !== placement.assigneeId ||
          prior.segments.length !== placement.segments.length ||
          placement.segments.some(
            (segment, index) =>
              segment.start !== prior.segments[index]?.start ||
              segment.end !== prior.segments[index]?.end,
          )),
      title: task.title,
      number: task.number,
      identifier:
        task.number === null
          ? null
          : `${loaded.project.slug.toUpperCase()}-${task.number}`,
      type: task.type === "bug" ? ("bug" as const) : ("task" as const),
      assigneeName:
        placement.assigneeId === task.userId
          ? task.assigneeName
          : placement.assigneeId === task.scheduledAssigneeId
            ? task.scheduledAssigneeName
            : null,
      currentAssigneeId: task.userId,
      currentAssigneeName: task.assigneeName,
      estimateSeconds: task.estimateSeconds,
      priority: releaseTaskPrioritySchema.parse(task.priority ?? "no-priority"),
      currentStart: task.startDate?.toISOString() ?? null,
      currentEnd: task.dueDate?.toISOString() ?? null,
      featureId: task.featureId,
      featureTitle: task.featureTitle,
      milestoneId: task.milestoneId,
      milestoneTitle: task.milestoneTitle,
      milestonePosition: task.milestonePosition,
      milestoneReleaseId: task.milestoneReleaseId,
    };
  });
}
