import { asc, eq, getTableColumns, type SQL, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  columnTable,
  milestoneTable,
  projectTable,
  releaseTable,
  taskTable,
} from "../database/schema";
import { boundedTaskRead, type TaskReadDatabase } from "../task/bounded-read";
import { taskIsCompleted } from "../task/task-is-completed";

const TIMEOUT_MESSAGE = "Release request took too long; retry later";
const leafWhere = sql`${taskTable.releaseId} = ${releaseTable.id} and ${taskTable.projectId} = ${releaseTable.projectId} and ${taskTable.type} in ('task', 'bug')`;
const milestoneWhere = sql`${milestoneTable.releaseId} = ${releaseTable.id} and exists (select 1 from ${taskTable} where ${taskTable.id} = ${milestoneTable.featureId} and ${taskTable.projectId} = ${releaseTable.projectId} and ${taskTable.type} = 'feature')`;
const milestoneDone = sql`exists (select 1 from ${columnTable} where ${columnTable.projectId} = ${releaseTable.projectId} and ${columnTable.isFinal} and (${columnTable.id} = ${milestoneTable.columnId} or (${milestoneTable.columnId} is null and ${columnTable.slug} = ${milestoneTable.status})))`;
function selectReleases(tx: TaskReadDatabase, where: SQL | undefined) {
  return tx
    .select({
      ...getTableColumns(releaseTable),
      taskTotal:
        sql<number>`(select count(*) from ${taskTable} where ${leafWhere})`.mapWith(
          Number,
        ),
      taskCompleted:
        sql<number>`(select count(*) from ${taskTable} where ${leafWhere} and ${taskIsCompleted})`.mapWith(
          Number,
        ),
      featureTotal:
        sql<number>`(select count(distinct groups.feature_id) from (select ${taskTable.featureId} as feature_id from ${taskTable} where ${leafWhere} union select ${milestoneTable.featureId} from ${milestoneTable} where ${milestoneWhere}) groups)`.mapWith(
          Number,
        ),
      milestoneTotal:
        sql<number>`(select count(*) from ${milestoneTable} where ${milestoneWhere})`.mapWith(
          Number,
        ),
      milestoneCompleted:
        sql<number>`(select count(*) from ${milestoneTable} where ${milestoneWhere} and ${milestoneDone})`.mapWith(
          Number,
        ),
      unfinished:
        sql<number>`(select count(*) from ${taskTable} where ${leafWhere} and ${taskTable.status} <> 'archived' and not ${taskIsCompleted}) + (select count(*) from ${milestoneTable} where ${milestoneWhere} and ${milestoneTable.status} <> 'archived' and not ${milestoneDone})`.mapWith(
          Number,
        ),
    })
    .from(releaseTable)
    .innerJoin(projectTable, eq(projectTable.id, releaseTable.projectId))
    .where(where)
    .orderBy(
      asc(releaseTable.startDate),
      asc(releaseTable.name),
      asc(releaseTable.id),
    );
}
type ReleaseRow = Awaited<ReturnType<typeof selectReleases>>[number];
function withProgress({
  taskTotal,
  taskCompleted,
  featureTotal,
  milestoneTotal,
  milestoneCompleted,
  unfinished,
  ...release
}: ReleaseRow) {
  return {
    ...release,
    progress: {
      tasks: { total: taskTotal, completed: taskCompleted },
      features: { total: featureTotal, completed: 0 },
      milestones: { total: milestoneTotal, completed: milestoneCompleted },
      unfinished,
    },
  };
}
export async function listReleases(projectId: string) {
  return (
    await boundedTaskRead(
      (tx) => selectReleases(tx, eq(releaseTable.projectId, projectId)),
      TIMEOUT_MESSAGE,
    )
  ).map(withProgress);
}
export async function getRelease(id: string) {
  const [row] = await boundedTaskRead(
    (tx) => selectReleases(tx, eq(releaseTable.id, id)),
    TIMEOUT_MESSAGE,
  );
  if (!row) throw new HTTPException(404, { message: "Release not found" });
  return withProgress(row);
}
