import { and, desc, eq, lt } from "drizzle-orm";
import type { AgentRunEventKind } from "../../agent/agent-types";
import {
  EVENT_MESSAGE_MAX_CHARS,
  MAX_EVENTS_PER_RUN,
} from "../../agent/constants";
import { publishAgentUpdate } from "../../agent/controllers/publish-agent-update";
import db from "../../database";
import { agentRunEventTable } from "../../database/schema";
import { loadRunnerRun, type RunnerRunRef } from "./load-runner-run";

/** Records progress lines, keeping only the latest ones per run. */
export async function appendRunEvents(
  ref: RunnerRunRef,
  events: ReadonlyArray<{ kind: AgentRunEventKind; message: string }>,
) {
  const run = await loadRunnerRun(ref);
  await db.insert(agentRunEventTable).values(
    events.map((event) => ({
      runId: run.id,
      kind: event.kind,
      message: event.message.slice(0, EVENT_MESSAGE_MAX_CHARS),
    })),
  );
  const [cutoff] = await db
    .select({ id: agentRunEventTable.id })
    .from(agentRunEventTable)
    .where(eq(agentRunEventTable.runId, run.id))
    .orderBy(desc(agentRunEventTable.id))
    .offset(MAX_EVENTS_PER_RUN - 1)
    .limit(1);
  if (cutoff)
    await db
      .delete(agentRunEventTable)
      .where(
        and(
          eq(agentRunEventTable.runId, run.id),
          lt(agentRunEventTable.id, cutoff.id),
        ),
      );
  await publishAgentUpdate(run.taskId, run.projectId);
}
