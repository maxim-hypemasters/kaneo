import { sql } from "drizzle-orm";
import db from "../../database";
import { agentRunTable } from "../../database/schema";

/**
 * Queues an assessment, or moves the one already queued to the new time, so
 * a burst of edits costs one run. A run already in progress is left alone;
 * its result will be outdated and the next queued run replaces it.
 */
export async function scheduleAssessment(
  taskId: string,
  options: {
    inputHash: string;
    delayMs?: number;
    requestedByUserId?: string | null;
  },
) {
  const notBefore = new Date(Date.now() + (options.delayMs ?? 0));
  await db
    .insert(agentRunTable)
    .values({
      taskId,
      kind: "assess",
      notBefore,
      inputHash: options.inputHash,
      requestedByUserId: options.requestedByUserId ?? null,
    })
    .onConflictDoUpdate({
      target: agentRunTable.taskId,
      targetWhere: sql`${agentRunTable.kind} = 'assess' and ${agentRunTable.status} = 'queued'`,
      set: {
        notBefore,
        inputHash: options.inputHash,
        ...(options.requestedByUserId
          ? { requestedByUserId: options.requestedByUserId }
          : {}),
      },
    });
}
