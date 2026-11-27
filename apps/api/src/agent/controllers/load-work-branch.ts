import { and, desc, eq, inArray } from "drizzle-orm";
import db from "../../database";
import { agentRunTable } from "../../database/schema";
import { WORK_RUN_KINDS } from "../agent-types";

/** The branch the task's latest succeeded Start or Ship pushed, if any. */
export async function loadWorkBranch(taskId: string): Promise<string | null> {
  const [row] = await db
    .select({ result: agentRunTable.result })
    .from(agentRunTable)
    .where(
      and(
        eq(agentRunTable.taskId, taskId),
        inArray(agentRunTable.kind, [...WORK_RUN_KINDS]),
        eq(agentRunTable.status, "succeeded"),
      ),
    )
    .orderBy(desc(agentRunTable.createdAt))
    .limit(1);
  return row?.result?.branch ?? null;
}
