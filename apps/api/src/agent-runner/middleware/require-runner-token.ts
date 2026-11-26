import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { agentError } from "../../agent/agent-error";
import { hashRunnerToken, RUNNER_TOKEN_PREFIX } from "../../agent/runner-token";
import db from "../../database";
import { workspaceAgentRunnerTable } from "../../database/schema";

/**
 * Authenticates a runner by its workspace token. Runner routes never see a
 * user session; every query they make is scoped to this workspace.
 */
export async function requireRunnerToken(c: Context, next: Next) {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token.startsWith(RUNNER_TOKEN_PREFIX))
    throw agentError("AI_AGENT_RUNNER_UNAUTHORIZED");
  const [runner] = await db
    .select({ workspaceId: workspaceAgentRunnerTable.workspaceId })
    .from(workspaceAgentRunnerTable)
    .where(eq(workspaceAgentRunnerTable.tokenHash, hashRunnerToken(token)))
    .limit(1);
  if (!runner) throw agentError("AI_AGENT_RUNNER_UNAUTHORIZED");
  c.set("runnerWorkspaceId", runner.workspaceId);
  c.header("Cache-Control", "no-store");
  return next();
}
