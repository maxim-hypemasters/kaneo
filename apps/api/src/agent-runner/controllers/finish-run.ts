import { and, eq, sql } from "drizzle-orm";
import { agentError } from "../../agent/agent-error";
import type { AgentRunStatus, ShipResult } from "../../agent/agent-types";
import type db from "../../database";
import { agentRunTable } from "../../database/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Ends a running run for the attempt that holds it; a run already ended,
 * cancelled or claimed again is refused. Returns the input the run finished
 * with.
 */
export async function finishRun(
  tx: Transaction,
  run: { id: string; attempts: number },
  outcome: {
    status: Extract<AgentRunStatus, "succeeded" | "failed" | "cancelled">;
    result?: ShipResult;
    errorCode?: string;
    error?: string;
  },
) {
  const [finished] = await tx
    .update(agentRunTable)
    .set({
      status: outcome.status,
      result: outcome.result ?? null,
      errorCode: outcome.errorCode ?? null,
      error: outcome.error ?? null,
      leaseExpiresAt: null,
      finishedAt: sql`(now() AT TIME ZONE 'utc')`,
    })
    .where(
      and(
        eq(agentRunTable.id, run.id),
        eq(agentRunTable.status, "running"),
        eq(agentRunTable.attempts, run.attempts),
      ),
    )
    .returning({ inputHash: agentRunTable.inputHash });
  if (!finished) throw agentError("AI_AGENT_RUN_NOT_RUNNING");
  return finished;
}
