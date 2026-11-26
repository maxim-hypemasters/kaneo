import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import db from "../database";
import { agentRunTable } from "../database/schema";
import { ASSESS_RUN_RETENTION_MS } from "./constants";

/** Deletes finished assessment runs past retention; Ship runs stay as history. */
export async function pruneAgentRuns() {
  const cutoff = new Date(Date.now() - ASSESS_RUN_RETENTION_MS);
  const deadline = Date.now() + 60_000;
  do {
    const count = await db.transaction(async (tx) => {
      const batch = await tx
        .select({ id: agentRunTable.id })
        .from(agentRunTable)
        .where(
          and(
            eq(agentRunTable.kind, "assess"),
            sql`${agentRunTable.status} in ('succeeded', 'failed', 'cancelled')`,
            lt(agentRunTable.createdAt, cutoff),
          ),
        )
        .orderBy(asc(agentRunTable.createdAt))
        .limit(500)
        .for("update", { skipLocked: true });
      if (!batch.length) return 0;
      await tx.delete(agentRunTable).where(
        inArray(
          agentRunTable.id,
          batch.map((run) => run.id),
        ),
      );
      return batch.length;
    });
    if (count < 500) break;
  } while (Date.now() < deadline);
}
