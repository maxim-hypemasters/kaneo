import { eq } from "drizzle-orm";
import db from "../../database";
import { workspaceAgentRunnerTable } from "../../database/schema";
import { RUNNER_ONLINE_WINDOW_MS } from "../constants";

export async function loadWorkspaceRunner(workspaceId: string) {
  const [row] = await db
    .select({
      tokenPrefix: workspaceAgentRunnerTable.tokenPrefix,
      lastSeenAt: workspaceAgentRunnerTable.lastSeenAt,
      runnerVersion: workspaceAgentRunnerTable.runnerVersion,
      createdAt: workspaceAgentRunnerTable.createdAt,
    })
    .from(workspaceAgentRunnerTable)
    .where(eq(workspaceAgentRunnerTable.workspaceId, workspaceId))
    .limit(1);
  return row ?? null;
}

export function isRunnerOnline(
  runner: { lastSeenAt: Date | null } | null,
  now = Date.now(),
): boolean {
  return Boolean(
    runner?.lastSeenAt &&
    now - runner.lastSeenAt.getTime() < RUNNER_ONLINE_WINDOW_MS,
  );
}

export function toRunnerStatus(
  runner: Awaited<ReturnType<typeof loadWorkspaceRunner>>,
) {
  return {
    configured: runner !== null,
    tokenPrefix: runner?.tokenPrefix ?? null,
    online: isRunnerOnline(runner),
    lastSeenAt: runner?.lastSeenAt ?? null,
    runnerVersion: runner?.runnerVersion ?? null,
    createdAt: runner?.createdAt ?? null,
  };
}
