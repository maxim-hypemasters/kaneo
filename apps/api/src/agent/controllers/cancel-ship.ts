import { and, eq, sql } from "drizzle-orm";
import db from "../../database";
import { agentRunTable } from "../../database/schema";
import { agentError } from "../agent-error";
import { cancelAbandonedRuns } from "./cancel-abandoned-runs";
import { loadAgentTask } from "./load-agent-task";
import { publishAgentUpdate } from "./publish-agent-update";

const utcNow = sql`(now() AT TIME ZONE 'utc')`;

/**
 * A queued run, or a running one whose runner is gone, is cancelled at once;
 * a live one is flagged and the runner stops it at its next heartbeat.
 */
export async function cancelShip(taskId: string) {
  const loaded = await loadAgentTask(taskId);
  if (!loaded) throw agentError("AI_AGENT_NO_ACTIVE_RUN");
  const ship = and(
    eq(agentRunTable.taskId, taskId),
    eq(agentRunTable.kind, "ship"),
  );
  const [queued] = await db
    .update(agentRunTable)
    .set({ status: "cancelled", finishedAt: utcNow, errorCode: "cancelled" })
    .where(and(ship, eq(agentRunTable.status, "queued")))
    .returning({ id: agentRunTable.id });
  if (!queued) {
    if ((await cancelAbandonedRuns(ship)).length) return;
    const [running] = await db
      .update(agentRunTable)
      .set({ cancelRequestedAt: utcNow })
      .where(and(ship, eq(agentRunTable.status, "running")))
      .returning({ id: agentRunTable.id });
    if (!running) throw agentError("AI_AGENT_NO_ACTIVE_RUN");
  }
  await publishAgentUpdate(taskId, loaded.task.projectId);
}
