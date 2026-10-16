import { and, eq, inArray, sql } from "drizzle-orm";
import { projectTable, taskTable } from "../database/schema";
import { projectAccessCondition } from "../project-access/project-access-condition";
import type { TaskReadDatabase } from "./bounded-read";
import { taskIsCompleted } from "./task-is-completed";

/**
 * Load each feature's task progress for the entire page, independent of
 * board filters. Tasks that aren't features get no entry. (The name predates
 * features, which replaced subtasks.)
 */
export async function getSubtaskCounts(
  db: TaskReadDatabase,
  taskIds: string[],
  workspaceId: string,
  publicOnly: boolean,
  userId?: string,
) {
  if (taskIds.length === 0) {
    return new Map<string, { completed: number; total: number }>();
  }

  const rows = await db
    .select({
      taskId: sql<string>`${taskTable.featureId}`,
      total: sql<number>`count(*)`.mapWith(Number),
      completed:
        sql<number>`count(*) filter (where ${taskIsCompleted})`.mapWith(Number),
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(
      and(
        inArray(taskTable.featureId, taskIds),
        eq(projectTable.workspaceId, workspaceId),
        publicOnly ? eq(projectTable.isPublic, true) : undefined,
        userId ? projectAccessCondition(userId, projectTable.id) : undefined,
      ),
    )
    .groupBy(taskTable.featureId);

  return new Map(
    rows.map(({ taskId, completed, total }) => [taskId, { completed, total }]),
  );
}
