import { MAX_OUTPUT_TOKENS } from "../constants";
import type { ModelLimits } from "./parse-tool-models";

/** The least a call asks for when the context window looks nearly full. */
export const MIN_OUTPUT_TOKENS = 1_024;

// A rough count for the mix of prose, JSON and Markdown in a request; it
// errs high, so the answer's room errs low.
const CHARS_PER_TOKEN = 3.5;

/** A rough token count for `chars` characters of request JSON. */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * The max_tokens for one call: MAX_OUTPUT_TOKENS, cut to the model's own
 * completion limit and to what the context window leaves after the request
 * (`requestChars` of serialized messages and tools). The context cut never
 * goes below MIN_OUTPUT_TOKENS, since the estimate is rough; the model's
 * completion limit always holds. Unknown limits change nothing.
 */
export function maxOutputTokens(
  limits: ModelLimits | null,
  requestChars: number,
): number {
  let tokens = MAX_OUTPUT_TOKENS;
  if (limits?.contextLength) {
    const room = limits.contextLength - estimateTokens(requestChars);
    tokens = Math.min(tokens, Math.max(MIN_OUTPUT_TOKENS, room));
  }
  if (limits?.maxCompletionTokens) {
    tokens = Math.min(tokens, limits.maxCompletionTokens);
  }
  return tokens;
}
