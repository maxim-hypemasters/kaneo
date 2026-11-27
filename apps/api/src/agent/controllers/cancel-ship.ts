import { and, eq, inArray, sql } from "drizzle-orm";
import db from "../../database";
import { agentRunTable } from "../../database/schema";
import { agentError } from "../agent-error";
import { WORK_RUN_KINDS } from "../agent-types";
import { cancelAbandonedRuns } from "./cancel-abandoned-runs";
import { loadAgentTask } from "./load-agent-task";
import { publishAgentUpdate } from "./publish-agent-update";
import { restoreTaskToTodo } from "./restore-task-to-todo";

const utcNow = sql`(now() AT TIME ZONE 'utc')`;

/**
 * Stops a Ship or Start. A queued run, or a running one whose runner is gone,
 * is cancelled at once; a live one is flagged and the runner stops it at its
 * next heartbeat. A queued run never started, so its task goes back to To Do.
 */
export async function cancelShip(taskId: string) {
  const loaded = await loadAgentTask(taskId);
  if (!loaded) throw agentError("AI_AGENT_NO_ACTIVE_RUN");
  const { projectId } = loaded.task;
  const work = and(
    eq(agentRunTable.taskId, taskId),
    inArray(agentRunTable.kind, [...WORK_RUN_KINDS]),
  );
  const [queued] = await db
    .update(agentRunTable)
    .set({ status: "cancelled", finishedAt: utcNow, errorCode: "cancelled" })
    .where(and(work, eq(agentRunTable.status, "queued")))
    .returning({ movedTask: agentRunTable.movedTask });
  if (queued) await restoreTaskToTodo({ taskId, projectId, ...queued });
  else {
    if ((await cancelAbandonedRuns(work)).length) return;
    const [running] = await db
      .update(agentRunTable)
      .set({ cancelRequestedAt: utcNow })
      .where(and(work, eq(agentRunTable.status, "running")))
      .returning({ id: agentRunTable.id });
    if (!running) throw agentError("AI_AGENT_NO_ACTIVE_RUN");
  }
  await publishAgentUpdate(taskId, projectId);
}
