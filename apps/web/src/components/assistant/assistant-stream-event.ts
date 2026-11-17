import type { AssistantStreamEvent } from "@kaneo/libs";

// The API's own type: an SSE body is not typed by the Hono client, so the
// API exports it and @kaneo/libs passes it on.
export type { AssistantStreamEvent };

export type AssistantStreamErrorCode = Extract<
  AssistantStreamEvent,
  { type: "error" }
>["code"];

// A record, so the compiler flags any code the API adds or drops.
const ERROR_CODES: Record<AssistantStreamErrorCode, true> = {
  OPENROUTER_KEY_INVALID: true,
  OPENROUTER_CREDITS: true,
  OPENROUTER_RATE_LIMITED: true,
  OPENROUTER_MODEL: true,
  OPENROUTER_UNAVAILABLE: true,
  OPENROUTER_CONTENT_FILTERED: true,
  ASSISTANT_STEP_LIMIT: true,
  ASSISTANT_DAILY_LIMIT: true,
  ASSISTANT_INTERNAL: true,
};

/** Every error code a turn's stream can end with. */
export const ASSISTANT_STREAM_ERROR_CODES = Object.keys(
  ERROR_CODES,
) as readonly AssistantStreamErrorCode[];

export const isAssistantStreamErrorCode = (
  value: unknown,
): value is AssistantStreamErrorCode =>
  typeof value === "string" && Object.hasOwn(ERROR_CODES, value);
