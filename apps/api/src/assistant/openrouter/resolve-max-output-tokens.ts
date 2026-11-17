import { getModelLimits } from "./list-tool-models";
import { maxOutputTokens } from "./max-output-tokens";
import type { ChatMessage, ToolDefinition } from "./types";

/**
 * The max_tokens to send with `messages` and `tools` to `model`, from the
 * limits in OpenRouter's cached model list. Never throws: without the list
 * it is MAX_OUTPUT_TOKENS.
 */
export async function resolveMaxOutputTokens(
  model: string,
  messages: readonly ChatMessage[],
  tools: readonly ToolDefinition[],
): Promise<number> {
  const limits = await getModelLimits(model);
  if (!limits) return maxOutputTokens(null, 0);
  return maxOutputTokens(limits, JSON.stringify({ messages, tools }).length);
}
