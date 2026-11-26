import { and, eq, sql } from "drizzle-orm";
import { agentError } from "../../agent/agent-error";
import { RUN_LEASE_MS } from "../../agent/constants";
import db from "../../database";
import { agentRunTable } from "../../database/schema";
import { loadRunnerRun, type RunnerRunRef } from "./load-runner-run";

/** Extends the lease and tells the runner whether to stop. */
export async function heartbeatRun(ref: RunnerRunRef) {
  const { attempts } = await loadRunnerRun(ref);
  const [run] = await db
    .update(agentRunTable)
    .set({
      leaseExpiresAt: sql`(now() AT TIME ZONE 'utc') + ${`${RUN_LEASE_MS} milliseconds`}::interval`,
    })
    .where(
      and(
        eq(agentRunTable.id, ref.runId),
        eq(agentRunTable.status, "running"),
        eq(agentRunTable.attempts, attempts),
      ),
    )
    .returning({ cancelRequestedAt: agentRunTable.cancelRequestedAt });
  if (!run) throw agentError("AI_AGENT_RUN_NOT_RUNNING");
  return { cancelRequested: run.cancelRequestedAt !== null };
}
