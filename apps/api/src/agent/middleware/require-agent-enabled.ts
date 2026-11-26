import type { Context, Next } from "hono";
import { isAiAgentEnabled } from "../agent-enabled";
import { agentError } from "../agent-error";

/** DISABLE_AI_AGENT=true answers every agent and runner route with a 404. */
export async function requireAgentEnabled(_c: Context, next: Next) {
  if (!isAiAgentEnabled()) throw agentError("AI_AGENT_DISABLED");
  return next();
}
