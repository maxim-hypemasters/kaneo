import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ApiError } from "../errors/api-error";

const ERRORS = {
  AI_AGENT_DISABLED: [404, "The AI agent is turned off on this instance"],
  AI_AGENT_NOT_ENABLED: [409, "The AI agent is not enabled for this project"],
  AI_AGENT_NOT_WORK_ITEM: [400, "Only tasks and bugs can go to the AI agent"],
  AI_AGENT_NOT_SHIPPABLE: [409, "The task is not ready for the AI agent"],
  AI_AGENT_QUESTION_NOT_FOUND: [404, "The question was already answered"],
  AI_AGENT_SUGGESTION_NOT_FOUND: [404, "The suggestion no longer exists"],
  AI_AGENT_SUGGESTION_OUTDATED: [
    409,
    "The suggestion no longer fits the task, which changed meanwhile",
  ],
  AI_AGENT_NO_ACTIVE_RUN: [409, "The AI agent is not working on this task"],
  AI_AGENT_RUN_NOT_FOUND: [404, "Agent run not found"],
  AI_AGENT_RUN_NOT_RUNNING: [409, "The agent run is no longer running"],
  AI_AGENT_RUNNER_UNAUTHORIZED: [401, "Invalid or revoked runner token"],
} as const satisfies Record<string, [ContentfulStatusCode, string]>;

export type AgentErrorCode = keyof typeof ERRORS;

export function agentError(code: AgentErrorCode) {
  const [status, message] = ERRORS[code];
  return new ApiError(status, { message, code });
}
