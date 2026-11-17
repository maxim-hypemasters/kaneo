import type { AssistantMessageDto } from "./response";

export type AssistantStreamErrorCode =
  | "OPENROUTER_KEY_INVALID"
  | "OPENROUTER_CREDITS"
  | "OPENROUTER_RATE_LIMITED"
  | "OPENROUTER_MODEL"
  | "OPENROUTER_UNAVAILABLE"
  | "OPENROUTER_CONTENT_FILTERED"
  | "ASSISTANT_STEP_LIMIT"
  | "ASSISTANT_DAILY_LIMIT"
  | "ASSISTANT_INTERNAL";

/** One `data:` record of an assistant turn's SSE stream. */
export type AssistantStreamEvent =
  // Only on POST /chats, as the first event.
  | { type: "chat"; chat: { id: string; title: string } }
  | { type: "delta"; text: string }
  // Insert or replace the message with this id.
  | { type: "message"; message: AssistantMessageDto }
  | { type: "error"; code: AssistantStreamErrorCode; retryable: boolean }
  | { type: "done"; pendingCount: number; truncated?: boolean };
