import { and, asc, eq, getTableColumns, type SQL, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { releaseTable, taskTable } from "../database/schema";
import { boundedTaskRead, type TaskReadDatabase } from "../task/bounded-read";
import { taskIsCompleted } from "../task/task-is-completed";
import { isUnfinishedItem } from "./unfinished-item";

const TIMEOUT_MESSAGE = "Release request took too long; retry later";

const countWhere = (condition: SQL) =>
  sql<number>`count(${taskTable.id}) filter (where ${condition})`.mapWith(
    Number,
  );
const isTask = sql`${taskTable.type} in ('task', 'bug')`;
const isFeature = sql`${taskTable.type} = 'feature'`;

// Completion follows feature progress: the item sits in a final column.
function selectReleases(tx: TaskReadDatabase, where: SQL | undefined) {
  return tx
    .select({
      ...getTableColumns(releaseTable),
      taskTotal: countWhere(isTask),
      taskCompleted: countWhere(sql`${isTask} and ${taskIsCompleted}`),
      featureTotal: countWhere(isFeature),
      featureCompleted: countWhere(sql`${isFeature} and ${taskIsCompleted}`),
      unfinished: countWhere(isUnfinishedItem),
    })
    .from(releaseTable)
    .leftJoin(
      taskTable,
      and(
        eq(taskTable.releaseId, releaseTable.id),
        eq(taskTable.projectId, releaseTable.projectId),
      ),
    )
    .where(where)
    .groupBy(releaseTable.id)
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
  featureCompleted,
  unfinished,
  ...release
}: ReleaseRow) {
  return {
    ...release,
    progress: {
      tasks: { total: taskTotal, completed: taskCompleted },
      features: { total: featureTotal, completed: featureCompleted },
      unfinished,
    },
  };
}

export async function listReleases(projectId: string) {
  const rows = await boundedTaskRead(
    (tx) => selectReleases(tx, eq(releaseTable.projectId, projectId)),
    TIMEOUT_MESSAGE,
  );
  return rows.map(withProgress);
}

export async function getRelease(id: string) {
  const [row] = await boundedTaskRead(
    (tx) => selectReleases(tx, eq(releaseTable.id, id)),
    TIMEOUT_MESSAGE,
  );
  if (!row) throw new HTTPException(404, { message: "Release not found" });
  return withProgress(row);
}
