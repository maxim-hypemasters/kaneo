import { redactInaccessibleActivity } from "../../activity/redaction/redact-inaccessible-activity";
import { readScheduleSnapshot } from "../transfers/read-schedule-snapshot";
import {
  planningSnapshotSchema,
  scheduleSnapshotSchema,
} from "../transfers/schema";
import { readMilestoneExecution } from "../../milestone/execution";
import { eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  activityTable,
  releaseTable,
  labelTable,
  milestoneTable,
  projectTable,
  projectPlanTable,
  taskTable,
  userTable,
} from "../../database/schema";

async function exportTasks(projectId: string, viewerId?: string) {
  return db.transaction(
    async (tx) => {
      const project = await tx.query.projectTable.findFirst({
        where: eq(projectTable.id, projectId),
      });

      if (!project) {
        throw new HTTPException(404, {
          message: "Project not found",
        });
      }

      const tasks = await tx
        .select({
          id: taskTable.id,
          title: taskTable.title,
          type: taskTable.type,
          featureId: taskTable.featureId,
          milestoneId: taskTable.milestoneId,
          releaseId: taskTable.releaseId,
          archivedAt: taskTable.archivedAt,
          number: taskTable.number,
          description: taskTable.description,
          status: taskTable.status,
          priority: taskTable.priority,
          startDate: taskTable.startDate,
          dueDate: taskTable.dueDate,
          estimateSeconds: taskTable.estimateSeconds,
          legacyStartDate: taskTable.legacyStartDate,
          legacyDueDate: taskTable.legacyDueDate,
          position: taskTable.position,
          createdAt: taskTable.createdAt,
          userId: taskTable.userId,
          assigneeName: userTable.name,
          assigneeId: userTable.id,
        })
        .from(taskTable)
        .leftJoin(userTable, eq(taskTable.userId, userTable.id))
        .where(eq(taskTable.projectId, projectId))
        .orderBy(taskTable.position);

      const taskIds = tasks.map((task) => task.id);

      const labelsData =
        taskIds.length > 0
          ? await tx
              .select({
                id: labelTable.id,
                name: labelTable.name,
                color: labelTable.color,
                taskId: labelTable.taskId,
              })
              .from(labelTable)
              .where(inArray(labelTable.taskId, taskIds))
          : [];

      const taskLabelsMap = new Map<
        string,
        Array<{ name: string; color: string }>
      >();
      for (const label of labelsData) {
        if (label.taskId) {
          if (!taskLabelsMap.has(label.taskId)) {
            taskLabelsMap.set(label.taskId, []);
          }
          taskLabelsMap.get(label.taskId)?.push({
            name: label.name,
            color: label.color,
          });
        }
      }

      const featureIds = tasks
        .filter((task) => task.type === "feature")
        .map((task) => task.id);
      const milestones = featureIds.length
        ? await tx
            .select()
            .from(milestoneTable)
            .where(inArray(milestoneTable.featureId, featureIds))
            .orderBy(milestoneTable.position, milestoneTable.id)
        : [];
      const schedules = await readMilestoneExecution(
        tx,
        projectId,
        milestones.map((milestone) => milestone.id),
      );

      const releases = await tx
        .select()
        .from(releaseTable)
        .where(eq(releaseTable.projectId, projectId));
      const rawSnapshots = taskIds.length
        ? await tx
            .select()
            .from(activityTable)
            .where(inArray(activityTable.taskId, taskIds))
        : [];
      const snapshots = viewerId
        ? await redactInaccessibleActivity(viewerId, rawSnapshots)
        : rawSnapshots.filter(
            (row) =>
              typeof row.eventData === "object" &&
              row.eventData !== null &&
              "projectId" in row.eventData &&
              row.eventData.projectId === projectId,
          );
      const plans = await tx
        .select()
        .from(projectPlanTable)
        .where(eq(projectPlanTable.projectId, projectId))
        .orderBy(projectPlanTable.generation);
      const scheduleHistory = new Map<
        string,
        Array<typeof scheduleSnapshotSchema._output>
      >();
      for (const plan of plans) {
        for (const placement of plan.placements) {
          const history = scheduleHistory.get(placement.taskId) ?? [];
          history.push({
            createdAt: plan.appliedAt.toISOString(),
            source: "applied",
            startDate: placement.start,
            dueDate: placement.end,
            assigneeId: placement.assigneeId,
            segments: placement.segments,
            sourceRevision: plan.inputRevision,
          });
          scheduleHistory.set(placement.taskId, history);
        }
      }
      for (const activity of snapshots) {
        if (activity.type !== "schedule_preserved") continue;
        const parsed = readScheduleSnapshot(
          activity.eventData,
          activity.createdAt,
        );
        if (parsed.success) {
          const history = scheduleHistory.get(activity.taskId) ?? [];
          history.push(parsed.data);
          scheduleHistory.set(activity.taskId, history);
        }
      }
      return {
        version: 4 as const,
        releases: releases.map(
          ({ id, name, startDate, codeFreezeDate, submissionDate }) => ({
            key: id,
            name,
            startDate,
            codeFreezeDate,
            submissionDate,
          }),
        ),
        milestones: milestones.map(
          ({
            id,
            featureId,
            title,
            description,
            position,
            leadId,
            priority,
            releaseId,
          }) => ({
            key: id,
            featureKey: featureId,
            title,
            description,
            startDate: schedules.get(id)?.startDate ?? null,
            endDate: schedules.get(id)?.endDate ?? null,
            position,
            leadId,
            status: schedules.get(id)?.status ?? ("to-do" as const),
            priority,
            releaseKey: releaseId,
          }),
        ),
        project: {
          name: project.name,
          slug: project.slug,
          description: project.description,
          exportedAt: new Date().toISOString(),
        },
        tasks: tasks.map((task) => ({
          key: task.id,
          featureKey: task.featureId,
          milestoneKey: task.milestoneId,
          releaseKey: task.releaseId,
          archivedAt: task.archivedAt?.toISOString() ?? null,
          planningSnapshots: snapshots
            .filter(
              (row) =>
                row.taskId === task.id &&
                row.type === "feature_planning_snapshot",
            )
            .map((row) =>
              planningSnapshotSchema.parse({
                ...(typeof row.eventData === "object" && row.eventData !== null
                  ? row.eventData
                  : {}),
                createdAt: row.createdAt.toISOString(),
              }),
            ),
          estimateSeconds: task.estimateSeconds,
          legacyStartDate: task.legacyStartDate?.toISOString() ?? null,
          legacyDueDate: task.legacyDueDate?.toISOString() ?? null,
          scheduleSnapshots: scheduleHistory.get(task.id) ?? [],
          title: task.title,
          type: task.type,
          description: task.description || "",
          status: task.status,
          priority: task.priority,
          dueDate: task.dueDate ? new Date(task.dueDate).toISOString() : null,
          startDate: task.startDate
            ? new Date(task.startDate).toISOString()
            : null,
          userId: task.userId || null,
          labels: taskLabelsMap.get(task.id) || [],
        })),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export default exportTasks;
