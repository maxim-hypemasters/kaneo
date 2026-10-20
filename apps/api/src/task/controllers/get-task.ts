import { boundedTaskRead } from "../bounded-read";
import { boardDescription, descriptionDeferred } from "../description-pages";
import { getSubtaskCounts } from "../get-subtask-counts";
import { eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable, userTable, projectTable } from "../../database/schema";

async function getTask(taskId: string, board = false, userId?: string) {
  const task = await db
    .select({
      id: taskTable.id,
      title: taskTable.title,
      number: taskTable.number,
      description: board ? boardDescription : taskTable.description,
      ...(board
        ? {
            descriptionDeferred,
          }
        : {}),
      status: taskTable.status,
      columnId: taskTable.columnId,
      priority: taskTable.priority,
      startDate: taskTable.startDate,
      dueDate: taskTable.dueDate,
      position: taskTable.position,
      archivedAt: taskTable.archivedAt,
      createdAt: taskTable.createdAt,
      userId: taskTable.userId,
      assigneeName: userTable.name,
      assigneeId: userTable.id,
      // A board patched from this read (a realtime update) must not keep
      // the previous assignee's photo.
      assigneeImage: userTable.image,
      projectId: taskTable.projectId,
      type: taskTable.type,
      featureId: taskTable.featureId,
      milestoneId: taskTable.milestoneId,
      releaseId: taskTable.releaseId,
      workspaceId: sql<string>`(select ${projectTable.workspaceId} from ${projectTable} where ${projectTable.id} = ${taskTable.projectId})`,
    })
    .from(taskTable)
    .leftJoin(userTable, eq(taskTable.userId, userTable.id))
    .where(eq(taskTable.id, taskId))
    .limit(1);

  if (!task.length || !task[0]) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  if (!board) return task[0];
  const { workspaceId, ...result } = task[0];
  if (!workspaceId) return result;
  // The task's own progress if it's a feature, and its feature's, so the
  // board can update both cards from this one read.
  const featureIds = result.featureId ? [result.featureId] : [];
  const counts = await boundedTaskRead((tx) =>
    getSubtaskCounts(tx, [taskId, ...featureIds], workspaceId, false, userId),
  );
  return {
    ...result,
    subtaskCounts: counts.get(taskId) ?? { completed: 0, total: 0 },
    parentSubtaskCounts: featureIds.map((id) => ({
      taskId: id,
      ...(counts.get(id) ?? { completed: 0, total: 0 }),
    })),
  };
}

export default getTask;
