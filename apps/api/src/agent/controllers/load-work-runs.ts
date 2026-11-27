import { and, desc, eq, getTableColumns, inArray } from "drizzle-orm";
import db from "../../database";
import { agentRunTable, userTable } from "../../database/schema";
import { WORK_RUN_KINDS, type WorkRunKind } from "../agent-types";

const ACTIVE: readonly string[] = ["queued", "running"];

/**
 * A task's two latest Ship and Start runs: the active one, if any, and the
 * last one that finished.
 */
export async function loadWorkRuns(taskId: string) {
  const rows = await db
    .select({
      ...getTableColumns(agentRunTable),
      requestedByName: userTable.name,
    })
    .from(agentRunTable)
    .leftJoin(userTable, eq(agentRunTable.requestedByUserId, userTable.id))
    .where(
      and(
        eq(agentRunTable.taskId, taskId),
        inArray(agentRunTable.kind, [...WORK_RUN_KINDS]),
      ),
    )
    .orderBy(desc(agentRunTable.createdAt))
    .limit(2);
  // The query selects work kinds only.
  const [latest, previous] = rows.map((row) => ({
    ...row,
    kind: row.kind as WorkRunKind,
  }));
  const active = latest && ACTIVE.includes(latest.status) ? latest : null;
  return {
    active,
    last: active ? (previous ?? null) : (latest ?? null),
  };
}
