import type {
  AssistantMessageStatus,
  AssistantToolCall,
} from "../message-types";
import type { CompletionResult } from "../openrouter/types";
import { sanitizeToolCalls } from "./sanitize-tool-calls";
import type { StreamFailure } from "./stream-error";

/**
 * How one finished model call is saved and what the turn does next: run
 * `toolCalls` and call the model again (`end` null), or end the turn.
 */
export type CompletionOutcome = {
  content: string;
  status: AssistantMessageStatus;
  toolCalls: AssistantToolCall[];
  end:
    | null
    | { type: "done"; truncated: boolean }
    | ({ type: "error" } & StreamFailure);
};

// Postgres text cannot hold NUL, so a stray one would fail the insert.
const withoutNul = (text: string) => text.replaceAll("\u0000", "");

/**
 * Text alone is an answer; tool calls are a step, stored with names and ids
 * every provider accepts on replay. A reply with neither, or
 * one moderation cut off, is saved as interrupted (shown, never replayed)
 * and ends the turn with an error. An answer cut at the token limit is kept
 * and reported as truncated.
 */
export function completionOutcome(result: CompletionResult): CompletionOutcome {
  const content = withoutNul(result.content);
  if (result.finishReason === "content_filter") {
    return {
      content,
      status: "interrupted",
      toolCalls: [],
      end: {
        type: "error",
        code: "OPENROUTER_CONTENT_FILTERED",
        retryable: false,
      },
    };
  }
  if (result.toolCalls.length > 0) {
    return {
      content,
      status: "complete",
      toolCalls: sanitizeToolCalls(result.toolCalls),
      end: null,
    };
  }
  if (content.trim() === "") {
    return {
      content,
      status: "interrupted",
      toolCalls: [],
      end: { type: "error", code: "OPENROUTER_UNAVAILABLE", retryable: true },
    };
  }
  return {
    content,
    status: "complete",
    toolCalls: [],
    end: { type: "done", truncated: result.finishReason === "length" },
  };
}

/** Partial answer text kept when a call fails or is stopped. */
export function partialAnswer(text: string): string | null {
  const content = withoutNul(text);
  return content.trim() === "" ? null : content;
}
