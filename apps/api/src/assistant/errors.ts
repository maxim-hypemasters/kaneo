import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ApiError } from "../errors/api-error";
import { OpenRouterError } from "./openrouter/openrouter-error";

const ASSISTANT_ERRORS = {
  ASSISTANT_DISABLED: [404, "The assistant is turned off on this instance"],
  ASSISTANT_CHAT_NOT_FOUND: [404, "Chat not found"],
  ASSISTANT_NOT_CONFIGURED: [
    409,
    "The assistant has no OpenRouter key yet; a workspace admin can add one in settings",
  ],
  ASSISTANT_KEY_UNREADABLE: [
    409,
    "The saved OpenRouter key can no longer be read; a workspace admin must enter it again",
  ],
  ASSISTANT_CHAT_BUSY: [409, "This chat is still answering; try again shortly"],
  ASSISTANT_NOTHING_PENDING: [409, "Nothing in this chat waits for approval"],
  ASSISTANT_NOTHING_TO_CONTINUE: [409, "There is nothing to continue"],
  ASSISTANT_PENDING_APPROVALS: [
    409,
    "Approve or reject the proposed changes first",
  ],
  ASSISTANT_TOO_MANY_TURNS: [
    429,
    "Too many answers are running at once; try again shortly",
  ],
  ASSISTANT_DAILY_LIMIT: [429, "You reached today's assistant limit"],
  OPENROUTER_KEY_REQUIRED: [400, "Enter an OpenRouter API key"],
  OPENROUTER_KEY_INVALID: [400, "OpenRouter rejected this API key"],
  ASSISTANT_MODEL_UNSUPPORTED: [
    400,
    "This model doesn't support tool calls on OpenRouter",
  ],
  UNSUPPORTED_CONTENT_TYPE: [400, "Send the request body as application/json"],
  OPENROUTER_UNREACHABLE: [502, "OpenRouter could not be reached; try again"],
} as const satisfies Record<string, readonly [ContentfulStatusCode, string]>;

export type AssistantErrorCode = keyof typeof ASSISTANT_ERRORS;

/** An assistant API error with its fixed status and message. */
export function assistantError(code: AssistantErrorCode): ApiError {
  const [status, message] = ASSISTANT_ERRORS[code];
  return new ApiError(status, { code, message });
}

/**
 * The API error for a failed OpenRouter key or model-list request: a
 * rejected key is the caller's to fix, anything else is upstream.
 */
export function openRouterRequestError(error: unknown): ApiError {
  if (!(error instanceof OpenRouterError)) throw error;
  return assistantError(
    error.code === "OPENROUTER_KEY_INVALID"
      ? "OPENROUTER_KEY_INVALID"
      : "OPENROUTER_UNREACHABLE",
  );
}
