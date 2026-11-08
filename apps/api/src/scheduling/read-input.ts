import { and, eq, inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { alias } from "drizzle-orm/pg-core";
import type db from "../database";
import {
  columnTable,
  milestoneTable,
  projectTable,
  releaseTable,
  taskRelationTable,
  taskTable,
  timeEntryTable,
  workCalendarTable,
  workspaceUserTable,
  userTable,
} from "../database/schema";
import { projectAccessCondition } from "../project-access/project-access-condition";
import type { ScheduleInput } from "./engine/types";
import { uniformPlanningCalendar } from "./uniform-calendar";

export type PlanningTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export async function readScheduleInput(
  tx: PlanningTransaction,
  projectId: string,
  userId: string,
  asOf: string,
  planFrom: string,
  options: { uniformCalendars?: boolean; timeZone?: string } = {},
) {
  const [project] = await tx
    .select()
    .from(projectTable)
    .where(eq(projectTable.id, projectId));
  if (!project) throw new HTTPException(404, { message: "Project not found" });
  const plannedUser = alias(userTable, "schedule_planned_user");
  const feature = alias(taskTable, "schedule_feature");
  const tasks = await tx
    .select({
      id: taskTable.id,
      title: taskTable.title,
      number: taskTable.number,
      assigneeName: userTable.name,
      scheduledAssigneeName: plannedUser.name,
      projectId: taskTable.projectId,
      type: taskTable.type,
      userId: taskTable.userId,
      priority: taskTable.priority,
      position: taskTable.position,
      status: taskTable.status,
      estimateSeconds: taskTable.estimateSeconds,
      releaseId: taskTable.releaseId,
      startDate: taskTable.startDate,
      dueDate: taskTable.dueDate,
      scheduleSegments: taskTable.scheduleSegments,
      scheduledAssigneeId: taskTable.scheduledAssigneeId,
      featureId: taskTable.featureId,
      featureTitle: feature.title,
      milestoneId: taskTable.milestoneId,
      milestoneTitle: milestoneTable.title,
      milestonePosition: milestoneTable.position,
      milestoneReleaseId: milestoneTable.releaseId,
    })
    .from(taskTable)
    .leftJoin(userTable, eq(taskTable.userId, userTable.id))
    .leftJoin(plannedUser, eq(taskTable.scheduledAssigneeId, plannedUser.id))
    .leftJoin(
      feature,
      and(
        eq(taskTable.featureId, feature.id),
        eq(feature.projectId, projectId),
      ),
    )
    .leftJoin(
      milestoneTable,
      and(
        eq(taskTable.milestoneId, milestoneTable.id),
        eq(milestoneTable.featureId, taskTable.featureId),
      ),
    )
    .where(
      and(
        eq(taskTable.projectId, projectId),
        inArray(taskTable.type, ["task", "bug"]),
      ),
    )
    .orderBy(taskTable.id);
  const columns = await tx
    .select()
    .from(columnTable)
    .where(eq(columnTable.projectId, projectId))
    .orderBy(columnTable.position, columnTable.id);
  const releases = await tx
    .select()
    .from(releaseTable)
    .where(eq(releaseTable.projectId, projectId))
    .orderBy(releaseTable.id);
  const assignees = [
    ...new Set(
      tasks
        .map((task) => task.userId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const calendars = options.uniformCalendars
    ? []
    : assignees.length
      ? await tx
          .select({
            userId: workCalendarTable.userId,
            timeZone: workCalendarTable.timeZone,
            weeklyIntervals: workCalendarTable.weeklyIntervals,
            timeOff: workCalendarTable.timeOff,
          })
          .from(workCalendarTable)
          .innerJoin(
            workspaceUserTable,
            and(
              eq(workspaceUserTable.workspaceId, workCalendarTable.workspaceId),
              eq(workspaceUserTable.userId, workCalendarTable.userId),
            ),
          )
          .where(
            and(
              eq(workCalendarTable.workspaceId, project.workspaceId),
              sql`${workCalendarTable.userId} = ANY(${sql.param(assignees)}::text[])`,
              projectAccessCondition(workCalendarTable.userId, projectId),
            ),
          )
          .orderBy(workCalendarTable.userId)
      : [];
  const eligibleMembers =
    options.uniformCalendars && assignees.length
      ? await tx
          .select({ userId: workspaceUserTable.userId })
          .from(workspaceUserTable)
          .where(
            and(
              eq(workspaceUserTable.workspaceId, project.workspaceId),
              sql`${workspaceUserTable.userId} = ANY(${sql.param(assignees)}::text[])`,
              projectAccessCondition(workspaceUserTable.userId, projectId),
            ),
          )
          .orderBy(workspaceUserTable.userId)
      : [];
  const planningTimeZone =
    project.planningTimeZone ?? options.timeZone ?? "UTC";
  const planningCalendars = options.uniformCalendars
    ? eligibleMembers.map(({ userId }) =>
        uniformPlanningCalendar(userId, planningTimeZone),
      )
    : calendars.map((calendar) => ({
        assigneeId: calendar.userId,
        timeZone: calendar.timeZone,
        weeklyIntervals: calendar.weeklyIntervals,
        timeOff: calendar.timeOff,
      }));
  const relations = await tx
    .select({
      sourceTaskId: taskRelationTable.sourceTaskId,
      targetTaskId: taskRelationTable.targetTaskId,
    })
    .from(taskRelationTable)
    .innerJoin(taskTable, eq(taskRelationTable.targetTaskId, taskTable.id))
    .where(
      and(
        eq(taskTable.projectId, projectId),
        eq(taskRelationTable.relationType, "blocks"),
      ),
    )
    .orderBy(taskRelationTable.id);
  const ids = tasks.map((task) => task.id);
  const local = new Set(ids);
  const externalIds = [
    ...new Set(
      relations.map((item) => item.sourceTaskId).filter((id) => !local.has(id)),
    ),
  ];
  const external = externalIds.length
    ? await tx
        .select({
          id: taskTable.id,
          projectId: taskTable.projectId,
          workspaceId: projectTable.workspaceId,
          generation: projectTable.scheduleGeneration,
          dueDate: taskTable.dueDate,
          status: taskTable.status,
          hasAccess: projectAccessCondition(userId, taskTable.projectId),
          done: sql<boolean>`exists(select 1 from ${columnTable} where ${columnTable.projectId} = ${taskTable.projectId} and ${columnTable.slug} = ${taskTable.status} and ${columnTable.isFinal})`,
        })
        .from(taskTable)
        .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
        .where(sql`${taskTable.id} = ANY(${sql.param(externalIds)}::text[])`)
        .orderBy(taskTable.id)
    : [];
  const logs = ids.length
    ? await tx
        .select({
          id: timeEntryTable.id,
          taskId: timeEntryTable.taskId,
          startTime: timeEntryTable.startTime,
          endTime: timeEntryTable.endTime,
          duration: timeEntryTable.duration,
        })
        .from(timeEntryTable)
        .innerJoin(taskTable, eq(timeEntryTable.taskId, taskTable.id))
        .where(
          and(
            eq(taskTable.projectId, projectId),
            inArray(taskTable.type, ["task", "bug"]),
          ),
        )
        .orderBy(timeEntryTable.id)
    : [];
  const logged = new Map<string, number>();
  for (const entry of logs) {
    const seconds = entry.endTime
      ? (entry.duration ??
        Math.max(
          0,
          Math.floor(
            (entry.endTime.getTime() - entry.startTime.getTime()) / 1000,
          ),
        ))
      : Math.max(
          0,
          Math.floor((Date.parse(asOf) - entry.startTime.getTime()) / 1000),
        );
    logged.set(entry.taskId, (logged.get(entry.taskId) ?? 0) + seconds);
  }
  const first = columns.find(
    (column) =>
      !column.isFinal && !["planned", "backlog"].includes(column.slug),
  );
  const state = (task: (typeof tasks)[number]) =>
    task.status === "archived"
      ? ("archived" as const)
      : columns.some((column) => column.slug === task.status && column.isFinal)
        ? ("done" as const)
        : ["planned", "backlog"].includes(task.status ?? "") ||
            !columns.some((column) => column.slug === task.status)
          ? ("backlog" as const)
          : task.status === first?.slug
            ? ("todo" as const)
            : ("active" as const);
  const input: ScheduleInput = {
    asOf,
    planFrom,
    timeZone: planningTimeZone,
    tasks: tasks.map((task) => ({
      id: task.id,
      assigneeId: task.userId,
      priority: task.priority,
      position: task.position ?? 0,
      state: state(task),
      estimateSeconds: task.estimateSeconds,
      loggedSeconds: logged.get(task.id) ?? 0,
      releaseId: task.releaseId,
    })),
    calendars: planningCalendars,
    releases: releases.map((release) => ({
      id: release.id,
      startDate: release.startDate,
      codeFreezeDate: release.codeFreezeDate,
      submissionDate: release.submissionDate,
    })),
    dependencies: relations.map((item) => ({
      blockerId: item.sourceTaskId,
      blockedId: item.targetTaskId,
    })),
    externalBlockers: external.map((task) => {
      const available =
        task.workspaceId === project.workspaceId && task.hasAccess;
      return {
        id: task.id,
        available,
        state:
          available && task.done
            ? ("done" as const)
            : available && task.status === "archived"
              ? ("archived" as const)
              : ("unfinished" as const),
        appliedEnd:
          available && task.generation > 0
            ? (task.dueDate?.toISOString() ?? null)
            : null,
      };
    }),
  };
  // Hash raw timer records, rather than elapsed running time, so a preview
  // remains reviewable while its clock is frozen at asOf.
  const revisionInput = {
    timeZone: options.uniformCalendars
      ? planningTimeZone
      : project.planningTimeZone,
    estimateDayMinutes: options.uniformCalendars
      ? 480
      : project.estimateDayMinutes,
    tasks: input.tasks.map(({ loggedSeconds: _logged, ...task }) => task),
    calendars: input.calendars,
    releases: input.releases,
    dependencies: input.dependencies,
    external: input.externalBlockers,
    logs,
  };
  return {
    project,
    tasks,
    input,
    revisionInput,
    hasRunningTimers: logs.some((entry) => !entry.endTime),
    state,
  };
}
