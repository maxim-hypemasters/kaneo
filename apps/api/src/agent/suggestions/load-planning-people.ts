import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNull,
  not,
  notInArray,
  sql,
} from "drizzle-orm";
import db from "../../database";
import {
  projectTable,
  taskTable,
  userTable,
  workspaceUserTable,
} from "../../database/schema";
import { projectAccessCondition } from "../../project-access/project-access-condition";
import { taskIsCompleted } from "../../task/task-is-completed";
import { TRIAGE_STATUS } from "../../triage/triage-status";

export const PLANNING_PEOPLE_LIMIT = 50;

/**
 * Members who can work in the project, with how many open tasks and bugs
 * each has in it. Names only: the list goes to the model. Work in other
 * projects is not counted, since the task's readers may not see them.
 */
export async function loadPlanningPeople({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) {
  const openTasks = db
    .select({ userId: taskTable.userId, count: count().as("open_count") })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(
      and(
        eq(taskTable.projectId, projectId),
        isNull(projectTable.archivedAt),
        inArray(taskTable.type, ["task", "bug"]),
        isNull(taskTable.archivedAt),
        notInArray(taskTable.status, ["archived", TRIAGE_STATUS]),
        not(taskIsCompleted),
      ),
    )
    .groupBy(taskTable.userId)
    .as("open_tasks");

  // workspace_member has no unique (workspace, user), hence distinct.
  return db
    .selectDistinct({
      id: userTable.id,
      name: userTable.name,
      openTasks: sql<number>`coalesce(${openTasks.count}, 0)::int`,
    })
    .from(workspaceUserTable)
    .innerJoin(userTable, eq(workspaceUserTable.userId, userTable.id))
    .leftJoin(openTasks, eq(openTasks.userId, userTable.id))
    .where(
      and(
        eq(workspaceUserTable.workspaceId, workspaceId),
        projectAccessCondition(workspaceUserTable.userId, projectId),
      ),
    )
    .orderBy(asc(userTable.name), asc(userTable.id))
    .limit(PLANNING_PEOPLE_LIMIT);
}
