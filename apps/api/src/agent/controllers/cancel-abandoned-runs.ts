import { and, eq, lt, type SQL, sql } from "drizzle-orm";
import db from "../../database";
import { agentRunTable } from "../../database/schema";
import { loadAgentTask } from "./load-agent-task";
import { postAgentComment, STOPPED_COMMENT } from "./post-agent-comment";
import { publishAgentUpdate } from "./publish-agent-update";

const utcNow = sql`(now() AT TIME ZONE 'utc')`;

/**
 * Cancels the matching running runs whose lease ran out. No runner holds
 * them, so nothing would act on a cancel flag, and a later claim must not
 * resume them. A Ship run says it stopped, as a live runner does on cancel.
 */
export async function cancelAbandonedRuns(scope: SQL | undefined) {
  const cancelled = await db
    .update(agentRunTable)
    .set({
      status: "cancelled",
      errorCode: "cancelled",
      leaseExpiresAt: null,
      finishedAt: utcNow,
    })
    .where(
      and(
        eq(agentRunTable.status, "running"),
        lt(agentRunTable.leaseExpiresAt, utcNow),
        scope,
      ),
    )
    .returning({ taskId: agentRunTable.taskId, kind: agentRunTable.kind });
  for (const run of cancelled) {
    const loaded = await loadAgentTask(run.taskId);
    if (!loaded) continue;
    const { projectId } = loaded.task;
    if (run.kind === "ship")
      await postAgentComment({
        taskId: run.taskId,
        projectId,
        content: STOPPED_COMMENT,
      });
    await publishAgentUpdate(run.taskId, projectId);
  }
  return cancelled;
}
