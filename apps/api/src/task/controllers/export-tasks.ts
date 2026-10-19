import { eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  labelTable,
  milestoneTable,
  projectTable,
  taskTable,
  userTable,
} from "../../database/schema";

async function exportTasks(projectId: string) {
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

      return {
        version: 2 as const,
        milestones: milestones.map(
          ({
            id,
            featureId,
            title,
            description,
            startDate,
            endDate,
            position,
          }) => ({
            key: id,
            featureKey: featureId,
            title,
            description,
            startDate,
            endDate,
            position,
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
          title: task.title,
          type: task.type,
          description: task.description || "",
          status: task.status,
          priority: task.priority || "low",
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
