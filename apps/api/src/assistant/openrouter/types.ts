// OpenAI-shaped chat completion messages, as OpenRouter accepts them.

import type {
  AssistantMessageUsage,
  AssistantToolCall,
} from "../message-types";

export type ChatToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: ChatToolCall[];
      reasoning_details?: unknown[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type CompletionFinishReason =
  | "stop"
  | "tool_calls"
  | "length"
  | "content_filter";

/** One streamed chat completion, merged from its chunks. */
export type CompletionResult = {
  content: string;
  toolCalls: AssistantToolCall[];
  // Passed back unmodified on the assistant message that made the calls.
  reasoningDetails: unknown[] | null;
  finishReason: CompletionFinishReason;
  usage: AssistantMessageUsage | null;
};

export type StreamChatCompletionInput = {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  allowDataCollection: boolean;
  /**
   * max_tokens for this call, from resolveMaxOutputTokens; MAX_OUTPUT_TOKENS
   * when omitted.
   */
  maxTokens?: number;
  signal: AbortSignal;
  onDelta(text: string): void;
};

/** GET /key, in US dollars. */
export type OpenRouterKeyInfo = {
  usageUsd: number;
  limitUsd: number | null;
  limitRemainingUsd: number | null;
  isFreeTier: boolean;
};
