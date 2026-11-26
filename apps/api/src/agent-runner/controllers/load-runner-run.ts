import { eq, getTableColumns } from "drizzle-orm";
import { agentError } from "../../agent/agent-error";
import type { AgentRunKind } from "../../agent/agent-types";
import db from "../../database";
import { agentRunTable, projectTable, taskTable } from "../../database/schema";

/** A runner request about one run: the claim attempt it holds, if any. */
export type RunnerRunRef = {
  runId: string;
  workspaceId: string;
  attempt: number | null;
};

/**
 * A running run of the runner's own workspace, held by the attempt the
 * request names. The workspace is read through the task, so a run whose task
 * moved to another workspace is not found. An attempt a later claim replaced
 * is refused, so it stops and its result is never recorded.
 */
export async function loadRunnerRun(ref: RunnerRunRef, kind?: AgentRunKind) {
  const [run] = await db
    .select({
      ...getTableColumns(agentRunTable),
      projectId: taskTable.projectId,
      workspaceId: projectTable.workspaceId,
    })
    .from(agentRunTable)
    .innerJoin(taskTable, eq(agentRunTable.taskId, taskTable.id))
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(eq(agentRunTable.id, ref.runId))
    .limit(1);
  if (
    !run ||
    run.workspaceId !== ref.workspaceId ||
    (kind && run.kind !== kind)
  )
    throw agentError("AI_AGENT_RUN_NOT_FOUND");
  if (run.status !== "running" || run.attempts !== ref.attempt)
    throw agentError("AI_AGENT_RUN_NOT_RUNNING");
  return run;
}
