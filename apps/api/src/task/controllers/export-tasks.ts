import { redactInaccessibleActivity } from "../../activity/redaction/redact-inaccessible-activity";
import { planningSnapshotSchema } from "../transfers/schema";
import { eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  activityTable,
  releaseTable,
  labelTable,
  milestoneTable,
  projectTable,
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

      const releases = await tx
        .select()
        .from(releaseTable)
        .where(eq(releaseTable.projectId, projectId));
      const rawSnapshots = featureIds.length
        ? await tx
            .select()
            .from(activityTable)
            .where(inArray(activityTable.taskId, featureIds))
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
      return {
        version: 3 as const,
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
            startDate,
            endDate,
            position,
            leadId,
            status,
            priority,
            releaseId,
          }) => ({
            key: id,
            featureKey: featureId,
            title,
            description,
            startDate,
            endDate,
            position,
            leadId,
            status,
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
